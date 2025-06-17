/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { z } from "zod"
import { BaseAgentNode } from "./base-node.js"
import { NODE_NAMES, type NodeName } from "../../../types.js"
import type { AgentContext } from "../../../types.js"
import type { ChatAnthropic } from "@langchain/anthropic"
import { AIMessage, AIMessageChunk, SystemMessage, ToolMessage } from "@langchain/core/messages"
import { ResponseCommand } from "../types.js"
import type { StateAnnotation } from "../types.js"
import { isString } from "lodash-es"
import chalk from "chalk"
import titleize from "titleize"

/**
 * Abstract helper for expert agents that work on a single currentTask and mark it done.
 */
export abstract class ExpertAgentNode extends BaseAgentNode {
  constructor(context: AgentContext, model: ChatAnthropic) {
    super(context, model)
  }

  protected override formatSystemPrompt() {
    return new SystemMessage(super.formatSystemPrompt().content + "\n\nYou MUST ONLY do what the user asks you to do.")
  }

  /**
   * Expert node override – inject currentTask and handle completion update.
   */
  override makeNode(_params: { endNodeName: string }) {
    return async (state: typeof StateAnnotation.State) => {
      const task = state.currentTask

      if (!task) {
        // Nothing to do – hand back to planner
        return new ResponseCommand({ goto: NODE_NAMES.MAIN_AGENT, update: {} })
      }

      // Log progress: starting work on the task
      this.log.info(chalk.magenta(`🔧  Starting task: "${task.description}"`))

      const possibleDestinations = [NODE_NAMES.HUMAN_LOOP, this.getName(), NODE_NAMES.MAIN_AGENT] as const

      const responseSchema = z.object({
        response: z.string().describe("Human-readable answer for the user"),
        summary: z.string().describe("One-paragraph summary of what you accomplished"),
        done: z.boolean().describe("Set true when this task is complete"),
        goto: z.enum(possibleDestinations),
      })

      // Limit context:
      //   • Messages created by this expert agent (to maintain its own working memory)
      //   • Routing/instruction messages coming from the task router
      //   • Project context messages produced by the project explorer agent
      const allowedAgentNames: NodeName[] = [this.getName(), NODE_NAMES.TASK_ROUTER, NODE_NAMES.PROJECT_EXPLORER]

      // console.log("state.messages", state.messages)

      const relevantMessages = state.messages.filter((m) => {
        if ("name" in m && m.name && (allowedAgentNames as readonly string[]).includes(m.name)) {
          return true
        }
        if (m.getType() === "tool" || (m instanceof AIMessageChunk && m.tool_calls && m.tool_calls.length > 0)) {
          return true
        }
        return false
      })

      // Take only the last 40 messages to keep token usage under control
      const messages = [...relevantMessages.slice(-40), new AIMessage(task.description)]

      this.debugLogMessages("relevant messages", messages)

      // --- Run the model with tool support first ---
      const finalMessages = await this.runWithTools(messages)

      // --- Now ask for the structured task-completion object ---
      const result = await this.invokeWithResponseSchema(responseSchema, [this.formatSystemPrompt(), ...finalMessages])

      // Build updated tasks list
      let updatedTasks = state.tasks
      if (result.done) {
        updatedTasks = state.tasks.map((t) =>
          t.id === task.id ? { ...t, status: "done", summary: result.summary } : t
        )
      }

      // Log progress: task completed (if done)
      if (result.done) {
        this.log.info(chalk.green(`✅  ${titleize(this.getName())} expert completed task: "${task.description}"\n`))
      }

      const update: Partial<typeof StateAnnotation.State> = {
        messages: [...messages, new AIMessage({ content: result.response, name: this.getName() })],
        tasks: updatedTasks,
        currentTask: result.done ? undefined : task,
        step: state.step + 1,
      }

      // After completion, hand back to planner; else if waiting for user, goto human
      const goto: NodeName | "__end__" = result.done ? NODE_NAMES.MAIN_AGENT : result.goto

      return new ResponseCommand({ goto, update })
    }
  }

  /**
   * Recursively call the model with tools enabled until no further tool calls are produced.
   * Returns the final augmented messages array (initial + AI + tool messages ...).
   */
  private async runWithTools(initial: AIMessage[]): Promise<AIMessage[]> {
    const messages: AIMessage[] = [...initial]

    // Call model with tools bound
    const response = await this.invokeWithTools([this.formatSystemPrompt(), ...messages])
    let partialResponse = false

    // Collect tool calls (if any) and execute
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

      const toolResults: AIMessage[] = []

      for (const call of response.tool_calls) {
        const tool = this.tools.find((t) => t.name === call.name)
        if (!tool) {
          toolResults.push(
            new ToolMessage({
              content: `Tool ${call.name} not found`,
              tool_call_id: call.id ?? "",
            })
          )
          continue
        }

        try {
          const output = await tool.invoke(call.args)
          toolResults.push(
            new ToolMessage({
              content: output,
              tool_call_id: call.id ?? "",
            })
          )
        } catch (err) {
          toolResults.push(
            new ToolMessage({
              content: `Error executing ${call.name}: ${err}`,
              tool_call_id: call.id ?? "",
            })
          )
        }
      }

      // Recurse with new messages (AI response + tool results)
      return this.runWithTools([...messages, response, ...toolResults])
    } else {
      // // eslint-disable-next-line no-console
      // console.log(response)

      if (response.additional_kwargs?.stop_reason && response.text === ".") {
        // Unclear why but Claude 4 sometimes returns a text response with just a single period.
        // We should continue in this case. I think... (maybe we need to bail from the loop)
        partialResponse = true
      }

      this.debugLogMessages("response", [response])
      this.logAgentMessage(response.text)
    }

    // TODO: handle different stop reasons
    if (!partialResponse && response.additional_kwargs?.stop_reason) {
      // No further tool calls, return transcript with the last response
      return [...messages, response]
    } else {
      // Still going... (last response should then be a status message to the user)
      return this.runWithTools([...messages, response])
    }
  }
}
