/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DynamicStructuredTool } from "@langchain/core/tools"
import { z } from "zod"
import { promises as fs } from "fs"
import { join, resolve, relative } from "path"
import type { AgentContext } from "../../../types.js"
import chalk from "chalk"
import * as readline from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import { renderDivider } from "../../../../../logger/util.js"
import type { LogEntryTransformers } from "../../../../../logger/log-entry.js"

const DEFAULT_MAX_DEPTH = 100

// Type definitions for tool results
export interface DirectoryItem {
  name: string
  type: "file" | "directory"
  path: string
  depth: number
}

export interface ListDirectoryResult {
  files: DirectoryItem[]
  error?: string
}

export interface FileReadResult {
  path: string
  data: string
  error?: string
}

export interface WriteFileResult {
  success: boolean
  message: string
  filePath: string
  bytesWritten?: number
}

export interface RemoveFilesResult {
  path: string
  success: boolean
  message: string
}

// Base interface for all tool parameters
export interface BaseToolParams {
  context: AgentContext
}

// Parameter interfaces for each tool function
export interface ListDirectoryParams extends BaseToolParams {
  directoryPath: string
  maxDepth?: number
}

export interface ReadFilesParams extends BaseToolParams {
  filePaths: string[]
}

export interface WriteFileParams extends BaseToolParams {
  filePath: string
  content: string
  force?: boolean
}

export interface WriteFilesParams extends BaseToolParams {
  files: Array<{
    filePath: string
    content: string
    force?: boolean
  }>
}

export interface RemoveFilesParams extends BaseToolParams {
  filePaths: string[]
  force?: boolean
}

// Path validation utilities
function validatePathSafety(targetPath: string, projectRoot: string): boolean {
  try {
    const absoluteProjectRoot = resolve(projectRoot)
    const absoluteTargetPath = resolve(targetPath.startsWith("/") ? targetPath : join(absoluteProjectRoot, targetPath))
    const relativePath = relative(absoluteProjectRoot, absoluteTargetPath)

    // The path is safe if:
    // 1. The relative path doesn't start with ".." (not going up beyond project root)
    // 2. No null byte injection attacks
    return !relativePath.startsWith("..") && !relativePath.includes("\0")
  } catch (error) {
    return false
  }
}

function getSafePath(targetPath: string, projectRoot: string): string {
  if (!validatePathSafety(targetPath, projectRoot)) {
    throw new Error(`Access denied: Path '${targetPath}' is outside the project root directory`)
  }
  return targetPath.startsWith("/") ? targetPath : join(projectRoot, targetPath)
}

const toolLogTransformers: LogEntryTransformers = {
  default: (entry) => {
    return { ...entry, msg: chalk.gray(entry.msg) }
  },
}

// Tool implementation functions
export async function listDirectory({
  context,
  directoryPath,
  maxDepth = DEFAULT_MAX_DEPTH,
}: ListDirectoryParams): Promise<string> {
  try {
    const absolutePath = getSafePath(directoryPath, context.projectRoot)
    const log = context.log

    // Check if directory exists
    const directoryExists = await fs
      .access(absolutePath)
      .then(() => true)
      .catch(() => false)

    if (!directoryExists) {
      const errorResult: ListDirectoryResult = {
        files: [],
        error: `Directory not found: ${directoryPath}`,
      }
      return JSON.stringify(errorResult)
    }

    const listDir = async (dir: string, depth: number): Promise<DirectoryItem[]> => {
      if (depth > maxDepth) return []

      const entries = await fs.readdir(dir, { withFileTypes: true })
      const items: DirectoryItem[] = []

      for (const entry of entries) {
        const fullPath = join(dir, entry.name)
        const relativePath = relative(context.projectRoot, fullPath)

        if (entry.isDirectory()) {
          items.push({
            name: entry.name + "/",
            type: "directory",
            path: relativePath,
            depth,
          })
          if (depth < maxDepth) {
            const subItems = await listDir(fullPath, depth + 1)
            items.push(...subItems)
          }
        } else {
          items.push({
            name: entry.name,
            type: "file",
            path: relativePath,
            depth,
          })
        }
      }

      return items
    }

    const files = await listDir(absolutePath, 0)
    log.info(`Listed directory (found ${files.length} files): ${directoryPath}`)

    const result: ListDirectoryResult = { files }
    return JSON.stringify(result)
  } catch (error) {
    const result: ListDirectoryResult = {
      files: [],
      error: `Error listing directory: ${error instanceof Error ? error.message : String(error)}`,
    }
    return JSON.stringify(result)
  }
}

export async function readFiles({ context, filePaths }: ReadFilesParams): Promise<string> {
  const results: FileReadResult[] = []
  const log = context.log

  let errorCount = 0
  let successCount = 0

  for (const filePath of filePaths) {
    try {
      const absolutePath = getSafePath(filePath, context.projectRoot)

      const fileExists = await fs
        .access(absolutePath)
        .then(() => true)
        .catch(() => false)

      if (!fileExists) {
        results.push({ path: filePath, data: "", error: "File not found" })
        errorCount++
        continue
      }

      const content = await fs.readFile(absolutePath, "utf-8")
      results.push({ path: filePath, data: content })
      successCount++
    } catch (error) {
      results.push({
        path: filePath,
        data: "",
        error: error instanceof Error ? error.message : String(error),
      })
      errorCount++
    }
  }

  if (successCount > 0) {
    log.info(`Read ${successCount} files:\n${results.map((r) => "- " + r.path).join("\n")}`)
  }
  if (errorCount > 0) {
    log.error(
      `❌  Error reading ${errorCount} files:\n${results
        .filter((r) => !!r.error)
        .map((r) => `- ${r.path}: ${r.error}`)
        .join("\n")}`
    )
  }

  return JSON.stringify(results, null, 2)
}

let yoloMessageShown = false

export async function writeFile({ context, filePath, content, force = false }: WriteFileParams): Promise<string> {
  const log = context.log

  try {
    const absolutePath = getSafePath(filePath, context.projectRoot)

    // Check if file already exists
    const fileExists = await fs
      .access(absolutePath)
      .then(() => true)
      .catch(() => false)

    // Auto-overwrite if the file was originally created earlier in this session by the assistant
    const absolutePathKey = absolutePath
    const createdThisRun = context.newFiles?.has(absolutePathKey) ?? false

    if (fileExists && !force && !createdThisRun) {
      // Log warning for potential file overwrite
      log.warn(`Attempting to overwrite existing file: ${filePath}`)

      // Read existing file to show what would be overwritten
      let existingContent = ""
      try {
        existingContent = await fs.readFile(absolutePath, "utf-8")
      } catch (error) {
        existingContent = "<unable to read existing content>"
      }

      // Provide detailed information about the operation
      const existingSize = existingContent.length
      const newSize = content.length

      // Show confirmation details
      log.info(chalk.yellow(`⚠️ File '${filePath}' already exists.`))
      log.info(chalk.gray(`📊 File Details:`))
      log.info(chalk.gray(`   - Current size: ${existingSize} characters`))
      log.info(chalk.gray(`   - New size: ${newSize} characters`))

      // -----------------------------------------------------------------
      // Show full diff between existing and new content
      // -----------------------------------------------------------------
      const diffLines = generateDiff(existingContent, content)

      log.info(renderDivider({ title: "🔍 Diff (current ↔ new)", width: 50 }))
      diffLines.forEach((line) => {
        log.info(line)
      })
      log.info(renderDivider({ width: 50 }))

      if (!context.yolo && !yoloMessageShown) {
        log.info("FYI: You can use the `--yolo` CLI flag on this command to write files without confirmation.")
        yoloMessageShown = true
      }

      const rl = getSharedReadline(context)

      try {
        const answer = await rl.question(chalk.yellow.bold(`\nDo you want to overwrite '${filePath}'? (y/N): `))
        const confirmed = answer.toLowerCase().trim() === "y" || answer.toLowerCase().trim() === "yes"

        if (!confirmed) {
          log.info(`File write cancelled by user: ${filePath}`)
          return `❌ File write cancelled by user. File '${filePath}' was not modified.`
        }

        log.info(`User confirmed file overwrite: ${filePath}`)
      } catch (error) {
        // Do not close shared readline
      }
    }

    // Create directory if it doesn't exist
    await fs.mkdir(join(absolutePath, ".."), { recursive: true })

    // Write the file
    await fs.writeFile(absolutePath, content, "utf-8")

    // Track newly created files so that subsequent overwrites in the same run
    // can proceed without confirmation.
    if (!fileExists) {
      if (!context.newFiles) {
        context.newFiles = new Set<string>()
      }
      context.newFiles.add(absolutePathKey)
    }

    // Log successful write
    if (fileExists) {
      log.info(`File overwritten: ${filePath}`)
    } else {
      log.info(`New file created: ${filePath}`)
    }

    return `✅  Successfully ${fileExists ? "overwrote" : "created"} file: ${filePath} (${content.length} characters)`
  } catch (error) {
    const errorMessage = `Error writing file: ${error instanceof Error ? error.message : String(error)}`
    log.error(errorMessage)
    return errorMessage
  }
}

export async function writeFiles({ context, files }: WriteFilesParams): Promise<string> {
  const results: WriteFileResult[] = []

  for (const { filePath, content, force } of files) {
    // Reuse existing writeFile logic for each entry
    const res = await writeFile({ context, filePath, content, force })

    // Normalise result into WriteFileResult for aggregated JSON output
    results.push({
      success: res.startsWith("✅"),
      message: res,
      filePath,
    })
  }

  return JSON.stringify(results, null, 2)
}

export async function removeFiles({ context, filePaths, force = false }: RemoveFilesParams): Promise<string> {
  const results: RemoveFilesResult[] = []
  const log = context.log

  let errorCount = 0
  let successCount = 0

  // First, validate all paths and check which files exist
  const validFilePaths: string[] = []
  const fileDetails: { path: string; absolutePath: string; exists: boolean }[] = []

  for (const filePath of filePaths) {
    try {
      const absolutePath = getSafePath(filePath, context.projectRoot)
      const fileExists = await fs
        .access(absolutePath)
        .then(() => true)
        .catch(() => false)

      fileDetails.push({ path: filePath, absolutePath, exists: fileExists })
      if (fileExists) {
        validFilePaths.push(filePath)
      }
    } catch (error) {
      results.push({
        path: filePath,
        success: false,
        message: `Invalid path: ${error instanceof Error ? error.message : String(error)}`,
      })
      errorCount++
    }
  }

  // If no valid files to delete, return early
  if (validFilePaths.length === 0) {
    log.warn("No valid files found to delete")
    return JSON.stringify(results, null, 2)
  }

  // Show files that will be deleted and get confirmation if needed
  if (!force && !context.yolo) {
    log.info(chalk.yellow(`⚠️ You are about to delete ${validFilePaths.length} file(s):`))
    for (const filePath of validFilePaths) {
      log.info(chalk.gray(`   - ${filePath}`))
    }

    if (!yoloMessageShown) {
      log.info("FYI: You can use the `--yolo` CLI flag on this command to delete files without confirmation.")
      yoloMessageShown = true
    }

    const rl = getSharedReadline(context)

    try {
      const answer = await rl.question(
        chalk.yellow(`\nDo you want to delete ${validFilePaths.length} file(s)? (y/N): `)
      )
      const confirmed = answer.toLowerCase().trim() === "y" || answer.toLowerCase().trim() === "yes"

      if (!confirmed) {
        log.info("File deletion cancelled by user")
        // Add cancelled results for valid files
        for (const filePath of validFilePaths) {
          results.push({
            path: filePath,
            success: false,
            message: "Deletion cancelled by user",
          })
        }
        return JSON.stringify(results, null, 2)
      }

      log.info("User confirmed file deletion")
    } catch (error) {
      // Do not close shared readline
    }
  }

  // Delete the files
  for (const { path: filePath, absolutePath, exists } of fileDetails) {
    if (!exists) {
      results.push({
        path: filePath,
        success: false,
        message: "File not found",
      })
      errorCount++
      continue
    }

    try {
      await fs.unlink(absolutePath)
      results.push({
        path: filePath,
        success: true,
        message: "File deleted successfully",
      })
      successCount++
    } catch (error) {
      results.push({
        path: filePath,
        success: false,
        message: `Delete failed: ${error instanceof Error ? error.message : String(error)}`,
      })
      errorCount++
    }
  }

  if (successCount > 0) {
    log.info(
      `Deleted ${successCount} files:\n${results
        .filter((r) => r.success)
        .map((r) => "- " + r.path)
        .join("\n")}`
    )
  }
  if (errorCount > 0) {
    log.error(
      `❌  Error deleting ${errorCount} files:\n${results
        .filter((r) => !r.success)
        .map((r) => `- ${r.path}: ${r.message}`)
        .join("\n")}`
    )
  }

  return JSON.stringify(results, null, 2)
}

// Tool definitions factory
export function createAgentTools(context: AgentContext): DynamicStructuredTool[] {
  context.log = context.log.createLog({ transformers: toolLogTransformers })

  return [
    // List directory tool
    new DynamicStructuredTool({
      name: "list_directory",
      description:
        "List contents of a directory. Returns a JSON object with 'files' array containing file/directory information and optional 'error' field if something fails.",
      schema: z.object({
        directoryPath: z.string().describe("Path to the directory to list"),
        maxDepth: z.number().optional().describe("Maximum depth to traverse (default: 100)"),
      }),
      func: async ({ directoryPath, maxDepth }) => {
        return await listDirectory({ context, directoryPath, maxDepth })
      },
    }),

    // Read files tool
    new DynamicStructuredTool({
      name: "read_files",
      description:
        "Read the contents of one or more files. Returns a JSON array where each element has a 'path' field, a 'data' field with the file contents and an optional 'error' field if the file could not be read.",
      schema: z.object({
        filePaths: z.array(z.string()).describe("Array of file paths to read"),
      }),
      func: async ({ filePaths }) => {
        return readFiles({ context, filePaths })
      },
    }),

    // Write file tool
    new DynamicStructuredTool({
      name: "write_file",
      description:
        "Write content to a file. Asks user for confirmation if file exists unless they're in YOLO mode or if the file was previously created by you or another agent.",
      schema: z.object({
        filePath: z.string().describe("The file path to write to"),
        content: z.string().describe("The content to write"),
      }),
      func: async ({ filePath, content, force }) => {
        // Allow overwriting without confirmation if yolo is enabled or force is true
        return writeFile({ context, filePath, content, force: force || context.yolo })
      },
    }),

    // Write multiple files tool
    new DynamicStructuredTool({
      name: "write_files",
      description:
        "Write multiple files in one go. Accepts an array of {filePath, content}. Sequentially invokes write_file logic for each entry. Use this when you need to write multiple files at once, since it will be faster.",
      schema: z.object({
        files: z
          .array(
            z.object({
              filePath: z.string().describe("Path of the file to write"),
              content: z.string().describe("Content to write"),
            })
          )
          .min(1)
          .describe("Array of files to write"),
      }),
      func: async ({ files }) => {
        return writeFiles({ context, files })
      },
    }),

    // Remove files tool
    new DynamicStructuredTool({
      name: "remove_files",
      description:
        "Delete one or more files. Asks user for confirmation unless force=true is used. Returns a JSON array where each element has 'path', 'success', and 'message' fields.",
      schema: z.object({
        filePaths: z.array(z.string()).describe("Array of file paths to delete"),
        force: z.boolean().optional().describe("Whether to delete files without confirmation"),
      }),
      func: async ({ filePaths, force }) => {
        // Allow deletion without confirmation if yolo is enabled or force is true
        return removeFiles({ context, filePaths, force: force || context.yolo })
      },
    }),
  ]
}

// -------------------------------------------------------------------------
// Diff helper
// -------------------------------------------------------------------------

function generateDiff(oldStr: string, newStr: string): string[] {
  const oldLines = oldStr.split(/\r?\n/)
  const newLines = newStr.split(/\r?\n/)

  // Build LCS length table
  const m = oldLines.length
  const n = newLines.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
  }

  const diff: string[] = []

  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      diff.push(chalk.gray("  " + oldLines[i]))
      i++
      j++
    } else if (dp[i][j + 1] >= dp[i + 1][j]) {
      diff.push(chalk.green("+ " + newLines[j]))
      j++
    } else {
      diff.push(chalk.red("- " + oldLines[i]))
      i++
    }
  }

  while (i < m) {
    diff.push(chalk.red("- " + oldLines[i]))
    i++
  }
  while (j < n) {
    diff.push(chalk.green("+ " + newLines[j]))
    j++
  }

  return diff
}

function getSharedReadline(context: AgentContext): readline.Interface {
  if (!context.rl) {
    context.rl = readline.createInterface({ input, output })
  }
  return context.rl
}
