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
import { SystemMessage } from "@langchain/core/messages"
import type { AnyZodObject } from "zod"
import { z } from "zod"
import { promises as fs } from "fs"
import { join } from "path"
import { ResponseCommand } from "../../../types.js"
import { NODE_NAMES, type AgentContext } from "../../../types.js"

const listDirectoryDefaultMaxDepth = 100

/**
 * Base class for all agent nodes in the LangGraph
 */
export abstract class BaseAgentNode {
  protected context: AgentContext
  protected model: ChatAnthropic
  protected tools: DynamicStructuredTool[]
  protected availableNodes: { [key: string]: BaseAgentNode }

  constructor(context: AgentContext) {
    this.context = context

    // Initialize base tools
    this.tools = this.initializeTools()

    // Initialize Anthropic model via LangChain
    this.model = new ChatAnthropic({
      modelName: "claude-sonnet-4-20250514",
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      temperature: 0.7,
      maxTokens: 100000,
    })

    this.availableNodes = {}
  }

  /**
   * Get the system prompt for this agent
   */
  abstract getSystemPrompt(): string

  /**
   * Get the name of this agent
   */
  abstract getName(): string

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
      const possibleDestinations = [params.endNodeName, ...Object.keys(this.availableNodes)] as const
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
            `The next agent to call, or ${NODE_NAMES.HUMAN_LOOP} if you need user input to proceed, or ${params.endNodeName} if the user's query has been resolved. Must be one of the specified values.`
          ),
      })

      // TODO: only add system prompt if it's the first invocation of the node?
      const messages = [new SystemMessage(this.formatSystemPrompt()), ...state.messages]
      return await this.generateResponse(state, responseSchema, messages)
    }
  }

  protected formatSystemPrompt() {
    const availableNodes = Object.values(this.availableNodes)
      .map((node) => `- ${node.getName()}: ${node.getAgentDescription()}`)
      .join("\n")
    return `${this.getSystemPrompt()}

You can consult with the following other agents:
${availableNodes}`
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
    const response = await this.model.bindTools(this.tools).invoke(messages)

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
      return this.generateResponse(state, responseSchema, [...messages, ...toolResults])
    } else {
      const summaryMessages = [...messages, new SystemMessage(this.getSummaryPrompt())]

      const result: z.infer<T> = await this.model
        .withStructuredOutput(responseSchema, {
          name: this.getName(),
          strict: true,
        })
        .invoke(summaryMessages)

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
        description: "List files and directories in a specified directory. Returns results as a JSON-encoded array.",
        schema: z.object({
          directoryPath: z.string().describe("The directory path to list"),
          recursive: z.boolean().optional().describe("Whether to list recursively"),
          maxDepth: z
            .number()
            .optional()
            .describe("Maximum depth for recursive listing")
            .default(listDirectoryDefaultMaxDepth),
        }),
        func: async ({ directoryPath, recursive, maxDepth }) => {
          return this.listDirectory(directoryPath, recursive, maxDepth)
        },
      })
    )

    // Read files tool
    tools.push(
      new DynamicStructuredTool({
        name: "read_files",
        description: "Read the contents of one or more files. Returns results as a JSON-encoded array.",
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
        description: "Write content to a file",
        schema: z.object({
          filePath: z.string().describe("The file path to write to"),
          content: z.string().describe("The content to write"),
          overwrite: z.boolean().optional().describe("Whether to overwrite existing file"),
        }),
        func: async ({ filePath, content, overwrite }) => {
          return this.writeFile(filePath, content, overwrite)
        },
      })
    )

    return tools
  }

  // TODO: disallow reading from or writing to files outside of the project root!

  /**
   * List directory contents
   */
  protected async listDirectory(
    directoryPath: string,
    recursive = false,
    maxDepth = listDirectoryDefaultMaxDepth
  ): Promise<string> {
    try {
      const absolutePath = join(this.context.projectRoot, directoryPath)

      if (
        !(await fs
          .access(absolutePath)
          .then(() => true)
          .catch(() => false))
      ) {
        return `Directory not found: ${directoryPath}`
      }

      const ignorePatterns = [
        "node_modules",
        ".git",
        ".idea",
        ".vscode",
        "dist",
        "build",
        ".garden",
        "__pycache__",
        ".pytest_cache",
        ".next",
        ".nuxt",
        "coverage",
      ]

      const listDir = async (path: string, depth: number): Promise<ListDirectoryResult[]> => {
        if (depth > maxDepth) return []

        const dirItems = await fs.readdir(path)

        const results: ListDirectoryResult[] = []

        for (const item of dirItems) {
          if (ignorePatterns.some((pattern) => item.includes(pattern))) {
            continue
          }

          const itemPath = join(path, item)
          const relativePath = itemPath.replace(absolutePath + "/", "")

          const stats = await fs.stat(itemPath)
          if (stats.isDirectory()) {
            results.push({ type: "directory", path: relativePath })
            if (recursive && depth < maxDepth) {
              const subItems = await listDir(itemPath, depth + 1)
              results.push(...subItems)
            }
          } else {
            results.push({ type: "file", path: relativePath })
          }
        }

        return results
      }

      const items = await listDir(absolutePath, 0)
      return items.join("\n") || "Empty directory"
    } catch (error) {
      return `Error listing directory: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  /**
   * Read files contents
   */
  protected async readFiles(filePaths: string[]): Promise<string> {
    const results: { filePath: string; content: string; error?: string }[] = []

    for (const filePath of filePaths) {
      try {
        const absolutePath = join(this.context.projectRoot, filePath)

        if (
          !(await fs
            .access(absolutePath)
            .then(() => true)
            .catch(() => false))
        ) {
          results.push({ filePath, content: "", error: "File not found" })
          continue
        }

        const content = await fs.readFile(absolutePath, "utf-8")
        results.push({ filePath, content })
      } catch (error) {
        results.push({ filePath, content: "", error: error instanceof Error ? error.message : String(error) })
      }
    }

    return JSON.stringify(results, null, 2)
  }

  /**
   * Write content to a file
   */
  protected async writeFile(filePath: string, content: string, overwrite = false): Promise<string> {
    // TODO: prompt for user confirmation before writing to file
    // TODO: add yolo mode as a CLI command flag, overwrite freely without confirmation when yolo is enabled
    try {
      const absolutePath = join(this.context.projectRoot, filePath)

      if (
        (await fs
          .access(absolutePath)
          .then(() => true)
          .catch(() => false)) &&
        !overwrite
      ) {
        return `File already exists: ${filePath}. Set overwrite=true to overwrite.`
      }

      await fs.mkdir(join(absolutePath, ".."), { recursive: true })
      await fs.writeFile(absolutePath, content, "utf-8")

      return `Successfully wrote to ${filePath}`
    } catch (error) {
      return `Error writing file: ${error instanceof Error ? error.message : String(error)}`
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
