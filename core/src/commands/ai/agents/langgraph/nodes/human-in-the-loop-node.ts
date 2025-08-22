/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { BaseMessage } from "@langchain/core/messages"
import { HumanMessage, SystemMessage } from "@langchain/core/messages"
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
const exitCommands = ["exit", "quit"]

/**
 * Human-in-the-loop node for user interaction
 */
export class HumanInTheLoopNode extends BaseAgentNode {
  private rl?: readline.Interface
  private store: GlobalConfigStore
  private getUserInput?: () => Promise<string>

  constructor(
    context: AgentContext,
    model: ChatAnthropic,
    store: GlobalConfigStore,
    history: string[],
    getUserInput?: () => Promise<string>
  ) {
    super(context, model)
    this.store = store
    this.getUserInput = getUserInput

    if (!this.getUserInput) {
      if (context.rl) {
        this.rl = context.rl
      } else {
        this.rl = readline.createInterface({
          input,
          output,
          history,
          removeHistoryDuplicates: true,
          historySize,
        })
        // store in context for reuse
        context.rl = this.rl
      }

      // Save history as we go
      this.rl.on("history", (lines) => {
        this.store
          .set(
            "aiPromptHistory",
            lines
              .map((line) => line.trim())
              // Don't remember exit commands or one-letter responses
              .filter((line) => line.length > 1 && !exitCommands.includes(line.trim().toLowerCase()))
          )
          .catch((e) => {
            this.log.warn("Failed to save AI prompt history: " + String(e))
          })
      })
    }
  }

  getName() {
    return NODE_NAMES.HUMAN_LOOP
  }

  getAgentDescription(): string {
    return "Human interaction agent. Use this to request user input when needed."
  }

  getSystemPrompt(): string {
    // This node doesn't use AI, so no system prompt needed
    return ""
  }

  protected override formatSystemPrompt(): SystemMessage {
    return new SystemMessage("")
  }

  // TODO: don't use AnyZodObject, use a more specific type with response and goto fields
  protected override async generateResponse<T extends AnyZodObject>(
    state: typeof StateAnnotation.State,
    _responseSchema: T,
    messages: BaseMessage[]
  ): Promise<ResponseCommand> {
    // Get user feedback
    let userFeedback = ""

    const readInput = async (): Promise<string> => {
      if (this.getUserInput) {
        return (await this.getUserInput()) || ""
      }

      return await this.rl!.question(chalk.cyan("\nYou: "))
    }

    while (userFeedback.trim().length === 0) {
      userFeedback = await readInput()

      if (exitCommands.includes(userFeedback.trim().toLowerCase())) {
        if (this.rl && this.rl !== this.context.rl) {
          this.rl.close()
        }
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

    this.log.info(chalk.gray(`\nThinking...\n`))

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
    if (this.rl && this.rl !== this.context.rl) {
      this.rl.close()
    }
  }
}
