/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { z } from "zod"
import { BaseAgentNode } from "./base-node.js"
import { NODE_NAMES, type AgentContext, type NodeName } from "../../../types.js"
import type { ChatAnthropic } from "@langchain/anthropic"
import type { Task } from "../types.js"
import { ResponseCommand } from "../types.js"
import { AIMessage, HumanMessage } from "@langchain/core/messages"
import type { StateAnnotation } from "../types.js"
import chalk from "chalk"
import { dedent } from "../../../../../util/string.js"

/**
 * Planner node – responsible for breaking the user request into tasks and
 * coordinating execution order. This replaces the original MainAgent routing
 * logic and hands control to TASK_ROUTER once the plan exists.
 */
export class PlannerNode extends BaseAgentNode {
  constructor(context: AgentContext, model: ChatAnthropic) {
    super(context, model)

    // Planner coordinates, it should not expose any file-system tools directly
    this.tools = []

    // Track whether we've already invoked the ProjectExplorer
    this.explorationDone = false
  }

  // Flag to avoid repeatedly calling the explorer
  private explorationDone: boolean

  getName(): NodeName {
    return NODE_NAMES.MAIN_AGENT
  }

  getAgentDescription(): string {
    return `Central planner and coordinator. Breaks user requests into tasks, asks for confirmation, routes each task to its dedicated expert, then summarises results.`
  }

  getSystemPrompt(): string {
    return `You are a DevOps assistant. Your responsibilities are as follows:

1. Read the user's request and decompose it into a list of discrete DevOps tasks.
2. For each task choose exactly one expert that should handle it. Valid experts are: kubernetes, docker, garden, terraform.
3. Produce a human-readable plan summarising the tasks and ask for confirmation (goto user_input).
4. Once confirmed, instruct the TaskRouter (goto task_router) to start executing the tasks one-by-one.

If the user's request is not clear, ask for clarification (goto user_input).

When formulating tasks, DO NOT add any additional instructions on top of the user's request in each task. Each expert is an expert in their own right and will be better at inferring the user's intent.

If there are multiple consecutive tasks for one agent, combine them into a single task.

When you output a plan you MUST include the full list of tasks in the \`tasks\` field of your JSON response so that they can be stored in graph state.`
  }

  /**
   * Custom makeNode so we can inject task updates into state.
   */
  override makeNode(_params: { endNodeName: string }) {
    return async (state: typeof StateAnnotation.State) => {
      // -------------------------------------------------------------------
      // 0.1 LLM-based project exploration (invoke ProjectExplorer once)
      // -------------------------------------------------------------------
      const hasUserMessage = state.messages.some((m) => m.getType() === "human")

      if (!this.explorationDone && hasUserMessage) {
        const hasExplorerMessage = state.messages.some(
          (m) => m.getType() === "ai" && m.name === NODE_NAMES.PROJECT_EXPLORER
        )

        if (!hasExplorerMessage) {
          this.log.info(`Let me start by exploring and gathering high-level information about the project.`)
        }

        // We have received the explorer summary message → mark exploration as done
        this.explorationDone = true

        const relevantMessages = state.messages.filter(
          (m) => m.getType() === "human" || (m.getType() === "ai" && m.name === NODE_NAMES.MAIN_AGENT)
        )

        return new ResponseCommand({
          goto: NODE_NAMES.PROJECT_EXPLORER,
          update: {
            messages: [
              ...relevantMessages,
              new HumanMessage({
                name: this.getName(),
                content: dedent`
                  Given the above context, explore the project structure and gather high-level information about the
                  project, paying special attention to what the user has asked for.
                `,
              }),
            ],
          },
        })
      }

      // --- 0. Post-execution phase: all tasks done → summarise & ask user ---
      if (state.tasks.length > 0 && state.tasks.every((t) => t.status === "done")) {
        const summaryLines = state.tasks.map(
          (t, i) => chalk.bold(`\n${i + 1}. ${t.description} `) + `– ${t.summary ?? "completed"}`
        )

        const finalSummary = [
          "Here's what we've done:",
          ...summaryLines,
          "\nLet me know if you'd like any further changes or additional tasks.",
        ].join("\n")

        // Surface to the user
        this.logAgentMessage(finalSummary)

        return new ResponseCommand({
          goto: NODE_NAMES.HUMAN_LOOP,
          update: {
            messages: [...state.messages, new AIMessage({ name: this.getName(), content: finalSummary })],
            step: state.step + 1,
            // reset tasks/currentTask if we want fresh cycle next time
          },
        })
      }

      // --- 1. Execution phase: tasks exist but not finished → send to router ---
      if (state.tasks.some((t) => t.status === "pending" || t.status === "in-progress")) {
        // Handing off to task router – inform in logs
        this.log.debug(chalk.gray(`Handing off to ${NODE_NAMES.TASK_ROUTER} to execute planned tasks...`))
        return new ResponseCommand({
          goto: NODE_NAMES.TASK_ROUTER,
          update: {},
        })
      }

      // --- 2. Planning phase (initial) ---
      const possibleDestinations = [
        NODE_NAMES.HUMAN_LOOP,
        NODE_NAMES.TASK_ROUTER,
        this.getName(),
        _params.endNodeName,
      ] as const

      const taskSchema = z.object({
        id: z.string(),
        description: z.string(),
        expert: z.enum([
          NODE_NAMES.KUBERNETES_AGENT,
          NODE_NAMES.DOCKER_AGENT,
          NODE_NAMES.GARDEN_AGENT,
          NODE_NAMES.TERRAFORM_AGENT,
        ]),
      })

      const responseSchema = z.object({
        response: z.string(),
        tasks: z.array(taskSchema).optional(),
        goto: z.enum(possibleDestinations),
      })

      const messages = [...state.messages]

      if (messages.length === 0) {
        messages.push(new HumanMessage("Please introduce yourself and ask me what I'd like to do."))
      }

      // Invoke LLM (no tools) to get structured output
      const result = await this.invokeWithResponseSchema(responseSchema, [this.formatSystemPrompt(), ...messages])

      // Prepare state update
      const update: Partial<typeof StateAnnotation.State> = {
        messages: [...messages, new AIMessage({ content: result.response, name: this.getName() })],
        step: state.step + 1,
      }

      if (result.tasks && result.tasks.length > 0) {
        // Enrich tasks with default status "pending" so the TaskRouter can act on them
        const pendingTasks = (result.tasks as unknown as Omit<Task, "status">[]).map((t) => ({
          ...t,
          status: "pending" as const,
        }))

        // Merge consecutive tasks assigned to the same expert into a single task
        const mergedTasks: Task[] = []
        for (const task of pendingTasks) {
          const last = mergedTasks[mergedTasks.length - 1]
          if (last && last.expert === task.expert) {
            // concatenate descriptions
            last.description = `${last.description}; ${task.description}`
            // Keep id list for traceability
            last.id = `${last.id},${task.id}`
          } else {
            mergedTasks.push({ ...task })
          }
        }

        update.tasks = mergedTasks
      }

      // Print the assistant response so the user sees the plan / follow-up question
      this.logAgentMessage(result.response)

      if (result.goto !== NODE_NAMES.HUMAN_LOOP) {
        this.log.info(chalk.gray(`Handing off to ${result.goto} agent...`))
      }

      // If all tasks are done we hand off to end
      const goto = result.goto as NodeName

      return new ResponseCommand({ goto, update })
    }
  }
}
