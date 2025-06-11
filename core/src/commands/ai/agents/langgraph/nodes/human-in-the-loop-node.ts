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
import { NODE_NAMES, type AgentContext } from "../../../types.js"
import { ResponseCommand } from "../types.js"
import chalk from "chalk"
import * as readline from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import type { AnyZodObject } from "zod"
import type { StateAnnotation } from "../types.js"
import type { ChatAnthropic } from "@langchain/anthropic"
import type { GlobalConfigStore } from "../../../../../config-store/global.js"

const historySize = 30

/**
 * Human-in-the-loop node for user interaction
 */
export class HumanInTheLoopNode extends BaseAgentNode {
  private rl: readline.Interface
  private store: GlobalConfigStore

  constructor(context: AgentContext, model: ChatAnthropic, store: GlobalConfigStore, history: string[]) {
    super(context, model)
    this.store = store
    this.rl = readline.createInterface({ input, output, history, removeHistoryDuplicates: true, historySize })

    // Save history as we go
    this.rl.on("history", (h) => {
      this.store
        .set("aiPromptHistory", h)
        .then(() => this.log.debug("Saved AI prompt history"))
        .catch((e) => {
          this.log.warn("Failed to save AI prompt history: " + String(e))
        })
    })

    // This node does not require an initial system prompt; mark as sent to
    // prevent the BaseAgentNode from injecting an empty init prompt that
    // clutters the conversation log.
    this.initPromptSent = true
  }

  getName() {
    return NODE_NAMES.HUMAN_LOOP
  }

  getAgentDescription(): string {
    return "Human interaction agent. Use this to request user input when needed."
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
    let userFeedback = ""

    while (userFeedback.trim().length === 0) {
      userFeedback = await this.rl.question(chalk.cyan("\nYou: "))

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
    }

    this.log.info(chalk.gray(`\nThinking...`))

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
