/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { StateAnnotation } from "../types.js"
import { ChatAnthropic } from "@langchain/anthropic"
import { DynamicStructuredTool } from "@langchain/core/tools"
import type { BaseMessage } from "@langchain/core/messages"
import { AIMessage, ToolMessage } from "@langchain/core/messages"
import type { AnyZodObject } from "zod"
import { z } from "zod"
import { promises as fs } from "fs"
import { join, resolve, relative } from "path"
import type { NodeName } from "../../../types.js"
import { ResponseCommand } from "../types.js"
import { NODE_NAMES, type AgentContext } from "../../../types.js"
import chalk from "chalk"
import * as readline from "node:readline/promises"
import type { Log } from "../../../../../logger/log-entry.js"
import { renderDivider } from "../../../../../logger/util.js"

const listDirectoryDefaultMaxDepth = 100

/**
 * Base class for all agent nodes in the LangGraph
 */
export abstract class BaseAgentNode {
  protected context: AgentContext
  protected model: ChatAnthropic
  protected tools: DynamicStructuredTool[]
  protected availableNodes: { [key: string]: BaseAgentNode }
  protected log: Log
  protected yoloMessageShown: boolean
  protected initPromptSent: boolean

  constructor(context: AgentContext) {
    this.context = context
    this.log = context.log.createLog({
      name: this.getName(),
    })

    // Initialize base tools
    this.tools = this.initializeTools()

    // Initialize Anthropic model via LangChain
    this.model = new ChatAnthropic({
      modelName: "claude-sonnet-4-20250514",
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      temperature: 0.7,
      maxTokens: 64000,
      streaming: true,
      // verbose: true,
    })

    this.availableNodes = {}
    this.yoloMessageShown = false
    this.initPromptSent = false
  }

  /**
   * Get the init prompt for this agent
   */
  abstract getInitPrompt(): string

  /**
   * Get the name of this agent
   */
  abstract getName(): NodeName

  /**
   * Get the description of this agent for other agents to know what to use it for.
   * This should be a concise, instructive description that helps the main agent
   * understand when to consult this agent and what it can help with.
   */
  abstract getAgentDescription(): string

  public getSummaryPrompt(): string {
    return "Please summarize your previous response and return in the provided schema format."
  }

  public addAvailableNodes(nodes: BaseAgentNode[]) {
    for (const node of nodes) {
      this.availableNodes[node.getName()] = node
    }
  }

  public makeNode(params: { endNodeName: string }) {
    return async (state: typeof StateAnnotation.State) => {
      const possibleDestinations = [params.endNodeName, this.getName(), ...Object.keys(this.availableNodes)] as const
      // define schema for the structured output:
      const responseSchema = z.object({
        response: z
          .string()
          .describe(
            "A human readable response to the original question. Does not need to be a final response. Will be streamed back to the user."
          ),
        goto: z
          .enum(possibleDestinations)
          .describe(
            `The next agent to call, or ${this.getName()} if you need to keep going yourself, or ${NODE_NAMES.HUMAN_LOOP} if you need user input to proceed, or ${params.endNodeName} if the user's query has been resolved. Must be one of the specified values.`
          ),
      })

      // TODO: only add system prompt if it's the first invocation of the node?
      let messages = [...state.messages]

      if (!this.initPromptSent) {
        this.initPromptSent = true
        messages = [new AIMessage(this.formatInitPrompt()), ...state.messages]
      }

      const command = await this.generateResponse(state, responseSchema, messages)

      this.log.debug(`Command from ${this.getName()}: ${JSON.stringify(command, null, 2)}`)

      return command
    }
  }

  public getNodeOptions() {
    return {
      ends: Object.keys(this.availableNodes),
    }
  }

  protected formatInitPrompt() {
    const availableNodes = Object.values(this.availableNodes)
      .map((node) => `- ${node.getName()}: ${node.getAgentDescription()}`)
      .join("\n")
    return `${this.getInitPrompt()}

You can consult with the following other agents:
${availableNodes}

DO NOT attempt to solve problems yourself that you have expert agents for.`
  }

  /**
   * Generate response using the model with optional tool invocation
   */
  protected async generateResponse<T extends AnyZodObject>(
    state: typeof StateAnnotation.State,
    responseSchema: T,
    messages: BaseMessage[]
  ): Promise<ResponseCommand> {
    // Invoke the model with tools if needed
    this.log.debug(
      `Invoking agent ${this.getName()} with messages: ${messages.map((m) => JSON.stringify(m._printableFields, null, 2)).join("\n")}`
    )
    const response = await this.model.bindTools(this.tools).invoke(messages)

    // console.log("response", response)

    // Execute any tool calls
    const toolResults: ToolMessage[] = []

    if (response.tool_calls && response.tool_calls.length > 0) {
      for (const toolCall of response.tool_calls) {
        const tool = this.tools.find((t) => t.name === toolCall.name)
        if (tool) {
          try {
            const result = await tool.invoke(toolCall.args)
            toolResults.push(
              new ToolMessage({
                name: toolCall.name,
                content: result,
                tool_call_id: toolCall.id ?? "",
                status: "success",
              })
            )
          } catch (error) {
            toolResults.push(
              new ToolMessage({
                name: toolCall.name,
                content: `Error executing ${toolCall.name}: ${error}`,
                tool_call_id: toolCall.id ?? "",
                status: "error",
              })
            )
          }
        } else {
          toolResults.push(
            new ToolMessage({
              name: toolCall.name,
              content: `Tool ${toolCall.name} not found`,
              tool_call_id: toolCall.id ?? "",
              status: "error",
            })
          )
        }
      }

      // Continue
      return this.generateResponse(state, responseSchema, [...messages, response, ...toolResults])
    } else {
      const summaryMessages = [...messages, new AIMessage(this.getSummaryPrompt())]
      this.log.debug(
        `Invoking agent ${this.getName()} with messages: ${summaryMessages.map((m) => JSON.stringify(m._printableFields, null, 2)).join("\n")}`
      )

      // TODO: see about avoiding this extra call
      const result: z.infer<T> = await this.model
        .withStructuredOutput(responseSchema, {
          name: this.getName(),
          strict: true,
        })
        .invoke(summaryMessages)

      this.log.info(result.response)

      if (result.goto !== this.getName()) {
        this.log.info(`Handing off to ${result.goto}`)
      }

      // handoff to another node or halt
      const aiMessage = new AIMessage({
        content: result.response,
        name: this.getName(),
      })

      return new ResponseCommand({
        goto: result.goto,
        update: { messages: [aiMessage], step: state.step + 1 },
      })
    }
  }
  /**
   * Initialize tools available to this agent
   */
  protected initializeTools(): DynamicStructuredTool[] {
    const tools: DynamicStructuredTool[] = []

    // List directory tool
    tools.push(
      new DynamicStructuredTool({
        name: "list_directory",
        description:
          "List contents of a directory. Returns a JSON object with 'files' array containing file/directory information and optional 'error' field if something fails.",
        schema: z.object({
          directoryPath: z.string().describe("Path to the directory to list"),
          maxDepth: z.number().optional().describe("Maximum depth to traverse (default: 100)"),
        }),
        func: async ({ directoryPath, maxDepth }) => {
          return await this.listDirectory(directoryPath, maxDepth)
        },
      })
    )

    // Read files tool
    tools.push(
      new DynamicStructuredTool({
        name: "read_files",
        description:
          "Read the contents of one or more files. Returns a JSON array where each element has a 'path' field, a 'data' field with the file contents and an optional 'error' field if the file could not be read.",
        schema: z.object({
          filePaths: z.array(z.string()).describe("Array of file paths to read"),
        }),
        func: async ({ filePaths }) => {
          return this.readFiles(filePaths)
        },
      })
    )

    // Write file tool
    tools.push(
      new DynamicStructuredTool({
        name: "write_file",
        description: "Write content to a file. Asks user for confirmation if file exists unless force=true is used.",
        schema: z.object({
          filePath: z.string().describe("The file path to write to"),
          content: z.string().describe("The content to write"),
          force: z.boolean().optional().describe("Whether to overwrite existing file without confirmation"),
        }),
        func: async ({ filePath, content, overwrite }) => {
          // Allow overwriting without confirmation if yolo is enabled
          return this.writeFile(filePath, content, overwrite || this.context.yolo)
        },
      })
    )

    return tools
  }

  // ✅ Security: Path validation implemented to prevent access outside project root

  /**
   * Validates that a given path is within the project root directory
   * @param targetPath The path to validate
   * @returns true if the path is safe (within project root), false otherwise
   */
  private validatePathSafety(targetPath: string): boolean {
    try {
      const projectRoot = resolve(this.context.projectRoot)

      // Resolve the target path - handle both relative and absolute paths
      const absoluteTargetPath = resolve(targetPath.startsWith("/") ? targetPath : join(projectRoot, targetPath))
      const relativePath = relative(projectRoot, absoluteTargetPath)

      // The path is safe if:
      // 1. The relative path doesn't start with ".." (not going up beyond project root)
      // 2. No null byte injection attacks
      return !relativePath.startsWith("..") && !relativePath.includes("\0") // Prevent null byte attacks
    } catch (error) {
      // If there's any error in path resolution, consider it unsafe
      return false
    }
  }

  /**
   * Get a safe absolute path within the project root
   * @param targetPath The path to resolve
   * @returns The safe absolute path or throws an error if outside project root
   */
  private getSafePath(targetPath: string): string {
    if (!this.validatePathSafety(targetPath)) {
      throw new Error(`Access denied: Path '${targetPath}' is outside the project root directory`)
    }
    return join(this.context.projectRoot, targetPath)
  }

  /**
   * List directory contents
   */
  protected async listDirectory(directoryPath: string, maxDepth = listDirectoryDefaultMaxDepth): Promise<string> {
    try {
      const absolutePath = this.getSafePath(directoryPath)

      // Check if directory exists
      if (
        !(await fs
          .access(absolutePath)
          .then(() => true)
          .catch(() => false))
      ) {
        return JSON.stringify({
          files: [],
          error: `Directory not found: ${directoryPath}`,
        })
      }

      const listDir = async (
        dir: string,
        depth: number
      ): Promise<Array<{ name: string; type: "file" | "directory"; path: string; depth: number }>> => {
        if (depth > maxDepth) return []

        const entries = await fs.readdir(dir, { withFileTypes: true })
        const items: Array<{ name: string; type: "file" | "directory"; path: string; depth: number }> = []

        for (const entry of entries) {
          const fullPath = join(dir, entry.name)
          const relativePath = relative(this.context.projectRoot, fullPath)

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
      return JSON.stringify({
        files,
      })
    } catch (error) {
      return JSON.stringify({
        files: [],
        error: `Error listing directory: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }

  /**
   * Read files contents
   */
  protected async readFiles(filePaths: string[]): Promise<string> {
    const results: { path: string; data: string; error?: string }[] = []

    let errorCount = 0
    let successCount = 0

    for (const filePath of filePaths) {
      try {
        const absolutePath = this.getSafePath(filePath)

        if (
          !(await fs
            .access(absolutePath)
            .then(() => true)
            .catch(() => false))
        ) {
          results.push({ path: filePath, data: "", error: "File not found" })
          errorCount++
          continue
        }

        const content = await fs.readFile(absolutePath, "utf-8")
        results.push({ path: filePath, data: content })
        successCount++
      } catch (error) {
        results.push({ path: filePath, data: "", error: error instanceof Error ? error.message : String(error) })
        errorCount++
      }
    }

    if (successCount > 0) {
      this.log.info(`✅ Successfully read ${successCount} files:\n${results.map((r) => "- " + r.path).join("\n")}`)
    }
    if (errorCount > 0) {
      this.log.error(`❌ Error reading ${errorCount} files:\n${results.map((r) => "- " + r.error).join(", ")}`)
    }

    return JSON.stringify(results, null, 2)
  }

  /**
   * Write content to a file
   */
  protected async writeFile(filePath: string, content: string, force = false): Promise<string> {
    try {
      const absolutePath = this.getSafePath(filePath)

      // Check if file already exists
      const fileExists = await fs
        .access(absolutePath)
        .then(() => true)
        .catch(() => false)

      if (fileExists && !force) {
        // Log warning for potential file overwrite
        this.log.warn(`Attempting to overwrite existing file: ${filePath}`)

        // Read existing file to show what would be overwritten
        let existingContent = ""
        try {
          existingContent = await fs.readFile(absolutePath, "utf-8")
        } catch (error) {
          // If we can't read it, just note that
          existingContent = "<unable to read existing content>"
        }

        // Provide detailed information about the operation
        const existingSize = existingContent.length
        const newSize = content.length

        // Show confirmation details
        this.log.info(chalk.yellow(`⚠️ File '${filePath}' already exists.`))
        this.log.info(chalk.gray(`📊 File Details:`))
        this.log.info(chalk.gray(`   - Current size: ${existingSize} characters`))
        this.log.info(chalk.gray(`   - New size: ${newSize} characters`))

        this.log.info(chalk.gray(renderDivider({ title: "🔍 Current content preview (first 200 chars)" })))
        this.log.info(chalk.gray(existingContent.substring(0, 200) + (existingContent.length > 200 ? "..." : "")))
        this.log.info(chalk.gray(renderDivider()))

        this.log.info(chalk.gray(renderDivider({ title: "🔍 New content preview (first 200 chars)" })))
        this.log.info(chalk.gray(content.substring(0, 200) + (content.length > 200 ? "..." : "")))
        this.log.info(chalk.gray(renderDivider()))

        if (!this.context.yolo && !this.yoloMessageShown) {
          this.log.info("FYI: You can use the `--yolo` CLI flag on this command to write files without confirmation.")
          this.yoloMessageShown = true
        }

        // Create readline interface for confirmation
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

        try {
          const answer = await rl.question(chalk.yellow(`\nDo you want to overwrite '${filePath}'? (y/N): `))
          rl.close()

          const confirmed = answer.toLowerCase().trim() === "y" || answer.toLowerCase().trim() === "yes"

          if (!confirmed) {
            this.log.info(`File write cancelled by user: ${filePath}`)
            return `❌ File write cancelled by user. File '${filePath}' was not modified.`
          }

          this.log.info(`User confirmed file overwrite: ${filePath}`)
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
        this.log.info(`File overwritten: ${filePath}`)
      } else {
        this.log.info(`New file created: ${filePath}`)
      }

      return `✅ Successfully ${fileExists ? "overwrote" : "created"} file: ${filePath} (${content.length} characters)`
    } catch (error) {
      const errorMessage = `Error writing file: ${error instanceof Error ? error.message : String(error)}`
      this.log.error(errorMessage)
      return errorMessage
    }
  }

  /**
   * Get available tools for this agent
   */
  protected getTools(): DynamicStructuredTool[] {
    return this.tools
  }
}

export interface ListDirectoryResult {
  type: "file" | "directory"
  path: string
}
