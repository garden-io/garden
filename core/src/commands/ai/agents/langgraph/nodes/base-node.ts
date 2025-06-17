/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { StateAnnotation } from "../types.js"
import type { ChatAnthropic } from "@langchain/anthropic"
import type { DynamicStructuredTool } from "@langchain/core/tools"
import type { AIMessageChunk } from "@langchain/core/messages"
import { BaseMessage } from "@langchain/core/messages"
import { AIMessage, SystemMessage, ToolMessage } from "@langchain/core/messages"
import type { AnyZodObject } from "zod"
import { z } from "zod"
import type { NodeName } from "../../../types.js"
import { ResponseCommand } from "../types.js"
import { NODE_NAMES, type AgentContext } from "../../../types.js"
import type { Log } from "../../../../../logger/log-entry.js"
import { createAgentTools } from "./tools.js"
import chalk from "chalk"
import { safeDumpYaml } from "../../../../../util/serialization.js"
import { isString, omit, truncate } from "lodash-es"
import { isArray } from "../../../../../util/objects.js"
import { getTerminalWidth } from "../../../../../logger/util.js"
import wrapAnsi from "wrap-ansi"
import { marked } from "marked"
import { markedTerminal } from "marked-terminal"
import pRetry from "p-retry"

marked.use(new markedTerminal({}, { em: chalk.bold, showSectionPrefix: false }))

const maxRetries = 3
const retryFactor = 2
const minTimeout = 1000

/**
 * Base class for all agent nodes in the LangGraph
 */
export abstract class BaseAgentNode {
  protected context: AgentContext
  private model: ChatAnthropic // Sub-classes should use helper methods to run the model
  protected tools: DynamicStructuredTool[]
  protected availableNodes: { [key: string]: BaseAgentNode }
  protected log: Log
  protected yoloMessageShown: boolean

  constructor(context: AgentContext, model: ChatAnthropic) {
    this.context = context
    this.log = context.log

    // Initialize tools using the factory function
    this.tools = createAgentTools(context)

    // Initialize Anthropic model via LangChain
    this.model = model

    this.availableNodes = {}
    this.yoloMessageShown = false
  }

  /**
   * Get the init prompt for this agent
   */
  abstract getSystemPrompt(): string

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

  public addTool(tool: DynamicStructuredTool) {
    this.tools.push(tool)
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

      const command = await this.generateResponse(state, responseSchema, state.messages)

      this.debugLogCommand(command)

      return command
    }
  }

  public getNodeOptions() {
    return {
      ends: Object.keys(this.availableNodes),
    }
  }

  protected debugLogCommand(command: ResponseCommand) {
    const update: Record<string, unknown> = (command.update as Record<string, unknown>) || {}

    const abridgedCommand: Record<string, unknown> = {
      goto: command.goto,
      update: omit(update, "messages"),
    }

    if (update.messages && isArray(update.messages) && update.messages.length > 0) {
      const lastMessage = update.messages[update.messages.length - 1] as BaseMessage
      abridgedCommand.lastMessage = abridgeMessage(lastMessage)
    } else if (update.messages) {
      abridgedCommand.lastMessage = abridgeMessage(update.messages as BaseMessage)
    }

    this.log.debug(`Command from ${this.getName()}:\n${safeDumpYaml(abridgedCommand)}`)
  }

  protected debugLogMessages(context: string, messages: BaseMessage[]) {
    const abridgedMessages = messages.map(abridgeMessage)

    this.log.debug(context + ":\n" + safeDumpYaml(abridgedMessages))
  }

  protected formatSystemPrompt(): SystemMessage {
    const availableNodes = Object.values(this.availableNodes)
      .map((node) => `- ${node.getName()}: ${node.getAgentDescription()}`)
      .join("\n")

    let prompt = this.getSystemPrompt()

    if (availableNodes.length > 0) {
      prompt += `You can consult with the following other agents:\n${availableNodes}\n\nDO NOT attempt to solve problems yourself that you have expert agents for.`
    }

    return new SystemMessage(prompt.trim())
  }

  protected logAgentMessage(message: string) {
    const indented = wordWrapWithIndent(message.trimStart(), 100, 2)
    const markdownStyled = marked.parse(indented.trimStart(), { async: false })
    const msg = chalk.cyan("\n> ") + markdownStyled.trimEnd() + "\n"
    this.log.info({ msg })
  }

  // TODO: implement retries and error handling for e.g. overload errors
  protected async invokeWithTools(messages: BaseMessage[]): Promise<AIMessageChunk> {
    return pRetry(async () => this.model.bindTools(this.tools).invoke(messages), {
      retries: maxRetries,
      factor: retryFactor,
      minTimeout,
      onFailedAttempt: (error) => {
        this.log.error(`Error invoking model: ${error}`)
        if (this.isRetryableError(error)) {
          return
        } else {
          throw error
        }
      },
    })
  }

  protected async invokeWithResponseSchema<T extends AnyZodObject>(
    responseSchema: T,
    messages: BaseMessage[]
  ): Promise<z.infer<T>> {
    return pRetry(
      async () =>
        this.model
          .withStructuredOutput(responseSchema, {
            name: this.getName(),
            strict: true,
          })
          .invoke(messages),
      {
        retries: maxRetries,
        factor: retryFactor,
        minTimeout,
        onFailedAttempt: (error) => {
          this.log.error(`Error invoking model: ${error}`)
          // Catch overload errors and retry
          if (this.isRetryableError(error)) {
            this.log.info(`Retrying... (attempt ${error.attemptNumber + 1} of ${maxRetries})`)
            return
          } else {
            throw error
          }
        },
      }
    )
  }

  private isRetryableError(error: Error) {
    // TODO: this is a hack, we should expect more specific errors
    // eslint-disable-next-line no-console
    console.log(error)
    return error instanceof Error && error.message.includes("overload")
  }

  // TODO: deduplicate this with the code in expert-agent-node.ts
  /**
   * Generate response using the model with optional tool invocation
   */
  protected async generateResponse<T extends AnyZodObject>(
    state: typeof StateAnnotation.State,
    responseSchema: T,
    messages: BaseMessage[]
  ): Promise<ResponseCommand> {
    // Invoke the model with tools if needed
    const lastMessage = messages[messages.length - 1]

    if (lastMessage) {
      this.log.debug(`Invoking agent ${this.getName()}. Last message:\n${safeDumpYaml([abridgeMessage(lastMessage)])}`)
    }

    const systemPrompt = this.formatSystemPrompt()

    const response = await this.invokeWithTools([systemPrompt, ...messages])

    this.debugLogMessages(this.getName() + " agent response", [response])

    // Execute any tool calls
    const toolResults: ToolMessage[] = []

    if (response.tool_calls && response.tool_calls.length > 0) {
      // Log text nodes in the chunked response
      if (isString(response.content)) {
        this.logAgentMessage(response.content)
      } else {
        for (const c of response.content) {
          if (c.type === "text" && c.text) {
            this.logAgentMessage(c.text)
          }
        }
      }

      for (const toolCall of response.tool_calls) {
        const tool = this.tools.find((t) => t.name === toolCall.name)
        if (tool) {
          try {
            const result = await tool.invoke(toolCall.args)
            this.log.debug(`Tool ${toolCall.name} executed successfully.`)
            toolResults.push(
              new ToolMessage({
                content: result,
                tool_call_id: toolCall.id ?? "",
              })
            )
          } catch (error) {
            this.log.debug(`Error executing tool ${toolCall.name}: ${error}`)
            toolResults.push(
              new ToolMessage({
                content: `Error executing ${toolCall.name}: ${error}`,
                tool_call_id: toolCall.id ?? "",
              })
            )
          }
        } else {
          this.log.debug(`Tool ${toolCall.name} not found in available tools.`)
          toolResults.push(
            new ToolMessage({
              content: `Tool ${toolCall.name} not found`,
              tool_call_id: toolCall.id ?? "",
            })
          )
        }
      }

      // Continue
      return this.generateResponse(state, responseSchema, [...messages, response, ...toolResults])
    } else {
      const result = await this.invokeWithResponseSchema(responseSchema, [systemPrompt, ...messages])

      this.logAgentMessage(result.response)

      if (result.goto !== this.getName() && result.goto !== NODE_NAMES.HUMAN_LOOP) {
        this.log.info(chalk.gray(`Handing off to ${result.goto} agent...`))
      }

      // handoff to another node or halt
      const aiMessage = new AIMessage({
        content: result.response,
        name: this.getName(),
      })

      return new ResponseCommand({
        goto: result.goto,
        update: { messages: [...messages, aiMessage], step: state.step + 1 },
      })
    }
  }
}

function abridgeMessage(m: BaseMessage) {
  const message: Record<string, unknown> = {
    type: m.getType(),
    name: m.name,
    ...omit(
      m._printableFields,
      "type",
      "name",
      "tool_call_chunks",
      "additional_kwargs",
      "response_metadata",
      "usage_metadata"
    ),
  }

  if (m.content && typeof m.content === "string") {
    message.content = truncate(m.content, { length: 100 })
  }

  // if (m.text && typeof m.text === "string") {
  //   message.text = truncate(m.text, { length: 100 })
  // }

  if (m.content && isArray(m.content)) {
    message.content = m.content.map((c) => {
      if (c instanceof BaseMessage) {
        return abridgeMessage(c)
      } else {
        return c
      }
    })
  }

  // if (m instanceof AIMessageChunk && m.tool_calls && m.tool_calls.length > 0) {
  //   message.tool_calls = m.tool_calls.map((t) => ({
  //     id: t.id,
  //     name: t.name,
  //     args: t.args,
  //   }))
  // }

  return message
}

function wordWrapWithIndent(text: string, maxWidth: number, indent: number) {
  const termWidth = getTerminalWidth() - indent
  const width = maxWidth > termWidth ? termWidth : maxWidth
  return wrapAnsi(text, width)
    .trimEnd()
    .split("\n")
    .map((line) => " ".repeat(indent) + line)
    .join("\n")
    .trimEnd()
}
