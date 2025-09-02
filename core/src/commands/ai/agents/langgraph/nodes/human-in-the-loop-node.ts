/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { BaseMessage } from "@langchain/core/messages"
import { HumanMessage } from "@langchain/core/messages"
import { BaseAgentNode } from "./base-node.js"
import type { NodeName } from "../../../types.js"
import { NODE_NAMES, ResponseCommand, type AgentContext } from "../../../types.js"
import chalk from "chalk"
import * as readline from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import type { AnyZodObject } from "zod"
import type { StateAnnotation } from "../types.js"

/**
 * Human-in-the-loop node for user interaction
 */
export class HumanInTheLoopNode extends BaseAgentNode {
  private rl: readline.Interface

  constructor(context: AgentContext) {
    super(context)
    this.rl = readline.createInterface({ input, output })
  }

  getName(): string {
    return "HumanInTheLoop"
  }

  getAgentDescription(): string {
    return "Human interaction agent - not a consultable expert"
  }

  getInitPrompt(): string {
    // This node doesn't use AI, so no system prompt needed
    return ""
  }

  // TODO: don't use AnyZodObject, use a more specific type with response and goto fields
  protected override async generateResponse<T extends AnyZodObject>(
    state: typeof StateAnnotation.State,
    _responseSchema: T,
    messages: BaseMessage[]
  ): Promise<ResponseCommand> {
    // Get user feedback
    const userFeedback = await this.rl.question(chalk.cyan("\nYou: "))

    if (userFeedback.toLowerCase() === "exit" || userFeedback.toLowerCase() === "quit") {
      // TODO: throw back to main agent and have it summarize the conversation and provide a final response
      this.rl.close()
      this.context.log.info(chalk.green("\nThank you for using the DevOps AI Assistant. Goodbye!"))
      return new ResponseCommand({
        update: {
          messages: [...messages, new HumanMessage(userFeedback)],
          userFeedback: "quit",
          step: state.step + 1,
        },
        goto: "__end__",
      })
    }

    // Find the last message that had `goto: NODE_NAMES.HUMAN_LOOP`
    let sender: NodeName = NODE_NAMES.MAIN_AGENT

    messages.findLast((message) => {
      if (message.getType() === "ai" && message.name) {
        const content = message.text
        try {
          const parsed = JSON.parse(content)
          if (parsed.goto === NODE_NAMES.HUMAN_LOOP) {
            sender = message.name as NodeName
            return true
          }
        } catch (e) {
          // Ignore
          return false
        }
      }
      return false
    })

    return new ResponseCommand({
      update: {
        messages: [...messages, new HumanMessage(userFeedback)],
        step: state.step + 1,
      },
      goto: sender,
    })
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    if (this.rl) {
      this.rl.close()
    }
  }
}
