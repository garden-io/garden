/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Anthropic } from "@anthropic-ai/sdk"
import type { Log } from "../../../logger/log-entry.js"
import type { AgentContext, AgentResponse, MessageParam } from "../types.js"
import fsExtra from "fs-extra"
import { join } from "node:path"
import chalk from "chalk"
import readline from "readline"

export interface ToolResponse {
  content: string
  result: "success" | "error" | "error_stop" | "error_continue"
}

export type ToolHandler = (params: { input: unknown; rootDir: string; log: Log }) => Promise<ToolResponse>

export interface ToolDefinition {
  name: string
  description: string
  input_schema: {
    type: "object"
    properties: Record<
      string,
      {
        type: string
        description?: string
        items?: { type: string }
        enum?: string[]
      }
    >
    required?: string[]
  }
}

export interface ListDirectoryToolInput {
  directory_path: string
  recursive?: boolean
  max_depth?: number
}

export interface ReadFilesToolInput {
  file_paths: string[]
}

export interface WriteFileToolInput {
  file_path: string
  content: string
  force?: boolean
}

export abstract class BaseAgent {
  protected name: string
  protected conversationHistory: MessageParam[] = []
  protected toolHandlers: Record<string, ToolHandler> = {}
  protected projectRoot: string

  constructor(
    protected context: AgentContext,
    name: string
  ) {
    this.name = name
    this.projectRoot = context.garden?.projectRoot || process.cwd()

    // Initialize base tool handlers
    this.toolHandlers = {
      list_directory: this.handleListDirectory.bind(this),
      read_files: this.handleReadFiles.bind(this),
      write_file: this.handleWriteFile.bind(this),
      ...this.getAdditionalToolHandlers(),
    }
  }

  abstract getName(): string
  abstract getDescription(): string
  abstract getSystemPrompt(): string

  abstract processQuery(query: string, additionalContext?: Record<string, unknown>): Promise<AgentResponse>

  protected addToHistory(message: MessageParam) {
    this.conversationHistory.push(message)
  }

  /**
   * Override this method in subclasses to add additional tool handlers
   */
  protected getAdditionalToolHandlers(): Record<string, ToolHandler> {
    return {}
  }

  /**
   * Get tool definitions for Anthropic API
   */
  protected getToolsDefinition(): ToolDefinition[] {
    const baseTools: ToolDefinition[] = [
      {
        name: "list_directory",
        description: "List files and directories in a given path",
        input_schema: {
          type: "object",
          properties: {
            directory_path: {
              type: "string",
              description: "The directory path to list (relative to project root)",
            },
            recursive: {
              type: "boolean",
              description: "Whether to list subdirectories recursively",
            },
            max_depth: {
              type: "integer",
              description: "Maximum depth for recursive listing",
            },
          },
          required: ["directory_path"],
        },
      },
      {
        name: "read_files",
        description: "Read the contents of one or more files",
        input_schema: {
          type: "object",
          properties: {
            file_paths: {
              type: "array",
              items: { type: "string" },
              description: "Array of file paths to read (relative to project root)",
            },
          },
          required: ["file_paths"],
        },
      },
      {
        name: "write_file",
        description: "Write content to a file",
        input_schema: {
          type: "object",
          properties: {
            file_path: {
              type: "string",
              description: "The path where the file should be written (relative to project root)",
            },
            content: {
              type: "string",
              description: "The content to write to the file",
            },
            force: {
              type: "boolean",
              description: "If true, skip the overwrite confirmation prompt",
            },
          },
          required: ["file_path", "content"],
        },
      },
    ]

    // Allow subclasses to add their own tools
    return [...baseTools, ...this.getAdditionalTools()]
  }

  /**
   * Override this method in subclasses to add additional tool definitions
   */
  protected getAdditionalTools(): ToolDefinition[] {
    return []
  }

  protected async handleListDirectory(params: { input: unknown; rootDir: string; log: Log }): Promise<ToolResponse> {
    const {
      directory_path: directoryPath,
      recursive = false,
      max_depth: maxDepth = 3,
    } = params.input as ListDirectoryToolInput
    const absolutePath = join(params.rootDir, directoryPath)

    try {
      const files: string[] = []
      const ignoreList = [
        "node_modules",
        ".git",
        ".garden",
        ".DS_Store",
        "__pycache__",
        ".pytest_cache",
        "dist",
        "build",
        ".next",
        ".venv",
        "venv",
      ]

      async function traverse(currentDir: string, currentDepth: number = 0): Promise<void> {
        if (!recursive && currentDepth > 0) return
        if (recursive && currentDepth >= maxDepth) return

        const entries = await fsExtra.readdir(currentDir, { withFileTypes: true })

        for (const entry of entries) {
          if (ignoreList.includes(entry.name)) continue

          const entryPath = join(currentDir, entry.name)
          const relativePath = entryPath.replace(params.rootDir + "/", "")

          if (entry.isDirectory()) {
            files.push(`📁 ${relativePath}/`)
            if (recursive || currentDepth === 0) {
              await traverse(entryPath, currentDepth + 1)
            }
          } else {
            files.push(`📄 ${relativePath}`)
          }
        }
      }

      await traverse(absolutePath, 0)
      return { content: files.join("\n"), result: "success" }
    } catch (error) {
      return { content: `Error listing directory: ${error}`, result: "error" }
    }
  }

  protected async handleReadFiles(params: { input: unknown; rootDir: string; log: Log }): Promise<ToolResponse> {
    const { file_paths: filePaths } = params.input as ReadFilesToolInput

    try {
      const results = await Promise.all(
        filePaths.map(async (relativePath) => {
          const absolutePath = join(params.rootDir, relativePath)
          try {
            const content = await fsExtra.readFile(absolutePath, "utf-8")
            return { path: relativePath, content }
          } catch (error) {
            return { path: relativePath, error: `Failed to read: ${error}` }
          }
        })
      )

      return { content: JSON.stringify(results, null, 2), result: "success" }
    } catch (error) {
      return { content: `Error reading files: ${error}`, result: "error" }
    }
  }

  protected async handleWriteFile(params: { input: unknown; rootDir: string; log: Log }): Promise<ToolResponse> {
    const { file_path: relativeFilePath, content, force } = params.input as WriteFileToolInput
    const absoluteFilePath = join(params.rootDir, relativeFilePath)

    params.log.debug(`Writing file ${absoluteFilePath}`)

    let operationType = "created"

    const fileExists = await fsExtra.pathExists(absoluteFilePath)
    if (fileExists) {
      if (force) {
        params.log.info(chalk.cyan(`Overwriting file: ${absoluteFilePath}`))
        operationType = "overwrote"
      } else {
        params.log.info(chalk.yellow(`File "${absoluteFilePath}" already exists.`))
        const shouldOverwrite = await this.confirmOverwrite(absoluteFilePath)
        if (!shouldOverwrite) {
          const message = `Write operation cancelled: File "${absoluteFilePath}" exists and overwrite was declined.`
          return { content: message, result: "error_stop" }
        }
        params.log.info(chalk.cyan(`Overwriting "${absoluteFilePath}".`))
        operationType = "overwrote"
      }
    } else {
      params.log.info(chalk.cyan(`Creating file "${absoluteFilePath}".`))
    }

    await fsExtra.outputFile(absoluteFilePath, content)
    const successMessage = `Successfully ${operationType} file "${absoluteFilePath}"`
    return { content: successMessage, result: "success" }
  }

  protected async confirmOverwrite(filePath: string): Promise<boolean> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    const answer = await new Promise<string>((resolve) => {
      rl.question(chalk.yellow(`File "${filePath}" already exists. Overwrite? (y/N) `), resolve)
    })
    rl.close()
    return answer.toLowerCase() === "y" || answer.toLowerCase() === "yes"
  }

  protected async callAnthropic(messages: MessageParam[]): Promise<Anthropic.Messages.Message> {
    const response = await this.context.anthropic.messages.create({
      model: "claude-3-sonnet-20241022",
      max_tokens: 4096,
      system: this.getSystemPrompt(),
      messages,
    })

    return response
  }

  /**
   * Call Anthropic with tool support
   */
  protected async callAnthropicWithTools(messages: MessageParam[]): Promise<Anthropic.Messages.Message> {
    const tools = this.getToolsDefinition()

    const response = await this.context.anthropic.messages.create({
      model: "claude-3-sonnet-20241022",
      max_tokens: 4096,
      system: this.getSystemPrompt(),
      messages,
      tools: tools as Anthropic.Tool[], // Type casting with proper type
    })

    // Handle tool use if present
    if (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter((c) => c.type === "tool_use")

      for (const toolUse of toolUseBlocks) {
        if (toolUse.type === "tool_use") {
          const handler = this.toolHandlers[toolUse.name]
          if (handler) {
            const result = await handler({
              input: toolUse.input,
              rootDir: this.projectRoot,
              log: this.context.log,
            })

            // Add tool result to conversation
            messages.push({
              role: "assistant",
              content: response.content,
            })
            messages.push({
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: toolUse.id,
                  content: result.content,
                },
              ],
            })

            // Continue conversation with tool results
            return this.callAnthropicWithTools(messages)
          }
        }
      }
    }

    return response
  }
}
