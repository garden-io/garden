/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { StateAnnotation } from "../types.js"
import { ChatAnthropic } from "@langchain/anthropic"
import type { DynamicStructuredTool } from "@langchain/core/tools"
import type { BaseMessage } from "@langchain/core/messages"
import { AIMessage, ToolMessage } from "@langchain/core/messages"
import type { AnyZodObject } from "zod"
import { z } from "zod"
import type { NodeName } from "../../../types.js"
import { ResponseCommand } from "../types.js"
import { NODE_NAMES, type AgentContext } from "../../../types.js"
import type { Log } from "../../../../../logger/log-entry.js"
import { createAgentTools } from "./tools.js"
import chalk from "chalk"

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
      origin: this.getName(),
    })

    // Initialize tools using the factory function
    this.tools = createAgentTools(context)

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
    const lastMessage = messages[messages.length - 1]

    if (lastMessage) {
      this.log.debug(
        `Invoking agent ${this.getName()}. Last message: ${JSON.stringify(lastMessage._printableFields, null, 2)}`
      )
    }

    const response = await this.model.bindTools(this.tools).invoke(messages)

    console.log(this.getName() + " agent response", response)

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
      // TODO: see about avoiding this extra call, can't see how to get structured outputs and tool calls to work together
      const result: z.infer<T> = await this.model
        .withStructuredOutput(responseSchema, {
          name: this.getName(),
          strict: true,
        })
        // Note that we're not adding the last response to the messages, so we're not repeating ourselves
        .invoke(messages)

      this.log.info("\n" + result.response + "\n")

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
