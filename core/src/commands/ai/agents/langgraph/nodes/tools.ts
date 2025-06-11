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
import { renderDivider } from "../../../../../logger/util.js"

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

// Tool implementation functions
export async function listDirectory({
  context,
  directoryPath,
  maxDepth = DEFAULT_MAX_DEPTH,
}: ListDirectoryParams): Promise<string> {
  try {
    const absolutePath = getSafePath(directoryPath, context.projectRoot)
    const log = context.log.createLog({ origin: "list_directory" })

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
    log.info(`✅ Successfully listed directory (found ${files.length} files): ${directoryPath}`)

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
  const log = context.log.createLog({ origin: "read_files" })

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
    log.info(`✅ Successfully read ${successCount} files:\n${results.map((r) => "- " + r.path).join("\n")}`)
  }
  if (errorCount > 0) {
    log.error(
      `❌ Error reading ${errorCount} files:\n${results
        .filter((r) => !!r.error)
        .map((r) => `- ${r.path}: ${r.error}`)
        .join("\n")}`
    )
  }

  return JSON.stringify(results, null, 2)
}

let yoloMessageShown = false

export async function writeFile({ context, filePath, content, force = false }: WriteFileParams): Promise<string> {
  const log = context.log.createLog({ origin: "write_file" })

  try {
    const absolutePath = getSafePath(filePath, context.projectRoot)

    // Check if file already exists
    const fileExists = await fs
      .access(absolutePath)
      .then(() => true)
      .catch(() => false)

    if (fileExists && !force) {
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

      log.info(chalk.gray(renderDivider({ title: "🔍 Current content preview (first 200 chars)" })))
      log.info(chalk.gray(existingContent.substring(0, 200) + (existingContent.length > 200 ? "..." : "")))
      log.info(chalk.gray(renderDivider()))

      log.info(chalk.gray(renderDivider({ title: "🔍 New content preview (first 200 chars)" })))
      log.info(chalk.gray(content.substring(0, 200) + (content.length > 200 ? "..." : "")))
      log.info(chalk.gray(renderDivider()))

      if (!context.yolo && !yoloMessageShown) {
        log.info("FYI: You can use the `--yolo` CLI flag on this command to write files without confirmation.")
        yoloMessageShown = true
      }

      // Create readline interface for confirmation
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

      try {
        const answer = await rl.question(chalk.yellow(`\nDo you want to overwrite '${filePath}'? (y/N): `))
        rl.close()

        const confirmed = answer.toLowerCase().trim() === "y" || answer.toLowerCase().trim() === "yes"

        if (!confirmed) {
          log.info(`File write cancelled by user: ${filePath}`)
          return `❌ File write cancelled by user. File '${filePath}' was not modified.`
        }

        log.info(`User confirmed file overwrite: ${filePath}`)
      } catch (error) {
        rl.close()
        return `❌ Error getting user confirmation: ${error instanceof Error ? error.message : String(error)}`
      }
    }

    // Create directory if it doesn't exist
    await fs.mkdir(join(absolutePath, ".."), { recursive: true })

    // Write the file
    await fs.writeFile(absolutePath, content, "utf-8")

    // Log successful write
    if (fileExists) {
      log.info(`File overwritten: ${filePath}`)
    } else {
      log.info(`New file created: ${filePath}`)
    }

    return `✅ Successfully ${fileExists ? "overwrote" : "created"} file: ${filePath} (${content.length} characters)`
  } catch (error) {
    const errorMessage = `Error writing file: ${error instanceof Error ? error.message : String(error)}`
    log.error(errorMessage)
    return errorMessage
  }
}

// Tool definitions factory
export function createAgentTools(context: AgentContext): DynamicStructuredTool[] {
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
      description: "Write content to a file. Asks user for confirmation if file exists unless force=true is used.",
      schema: z.object({
        filePath: z.string().describe("The file path to write to"),
        content: z.string().describe("The content to write"),
        force: z.boolean().optional().describe("Whether to overwrite existing file without confirmation"),
      }),
      func: async ({ filePath, content, force }) => {
        // Allow overwriting without confirmation if yolo is enabled or force is true
        return writeFile({ context, filePath, content, force: force || context.yolo })
      },
    }),
  ]
}
