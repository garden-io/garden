/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { getExampleDir, makeTestGarden, initTestLogger } from "../../../../helpers.js"
import { createAgentGraph } from "../../../../../src/commands/ai/agents/langgraph/graph.js"
import { GlobalConfigStore } from "../../../../../src/config-store/global.js"
import { HumanMessage } from "@langchain/core/messages"
import { NODE_NAMES, type AgentContext } from "../../../../../src/commands/ai/types.js"
import type { AgentGraphState } from "../../../../../src/commands/ai/agents/langgraph/types.js"

// Stub implementation of the ChatAnthropic model that returns deterministic
// responses so we can exercise the planner / router logic without calling the
// real Anthropic API.
class StubChatModel {
  private mainAgentCall = 0
  bindTools() {
    return {
      // Return no tool calls – tools are exercised separately.
      invoke: async () => ({ tool_calls: [] }),
    }
  }

  withStructuredOutput(_schema: unknown, opts: { name?: string }) {
    const nodeName = opts?.name

    return {
      invoke: async (_messages: any[]) => {
        switch (nodeName) {
          case NODE_NAMES.MAIN_AGENT: {
            this.mainAgentCall++
            if (this.mainAgentCall === 1) {
              return {
                response:
                  "I've prepared a plan: 1) Generate Kubernetes manifests 2) Create Garden config files. Proceed?",
                goto: NODE_NAMES.HUMAN_LOOP,
                tasks: [
                  {
                    id: "task1",
                    description: "Generate Kubernetes manifests",
                    expert: NODE_NAMES.KUBERNETES_AGENT,
                  },
                  {
                    id: "task2",
                    description: "Create Garden configuration files",
                    expert: NODE_NAMES.GARDEN_AGENT,
                  },
                ],
              }
            }
            if (this.mainAgentCall === 2) {
              return { response: "All done", goto: NODE_NAMES.HUMAN_LOOP }
            }
            // Fallback
            return { response: "All done", goto: NODE_NAMES.HUMAN_LOOP }
          }
          case NODE_NAMES.PROJECT_EXPLORER:
            return { response: "Project explored.", goto: NODE_NAMES.MAIN_AGENT }
          case NODE_NAMES.KUBERNETES_AGENT:
            return { response: "Kubernetes manifests generated.", goto: NODE_NAMES.MAIN_AGENT }
          case NODE_NAMES.GARDEN_AGENT:
            return { response: "Garden config generated.", goto: NODE_NAMES.MAIN_AGENT }
          default:
            return { response: "ok", goto: NODE_NAMES.MAIN_AGENT }
        }
      },
    }
  }
}

describe("AI Agent end-to-end", () => {
  let inputs: string[]
  let garden: any

  before(async () => {
    initTestLogger()
    // Make sure we have a fake API key so the command doesn't bail out.
    process.env.ANTHROPIC_API_KEY = "test-key"

    const projectDir = getExampleDir("demo-project-start")
    garden = await makeTestGarden(projectDir)
  })

  beforeEach(() => {
    // Reset the scripted user inputs before each test case.
    inputs = [
      "Please create Kubernetes manifests for the services in this project, and keep them relatively simple. Then proceed to create Garden configuration files.",
      "Yes please",
      "quit",
    ]
  })

  it("should explore, plan and route tasks correctly", async () => {
    const getUserInput = async () => inputs.shift() ?? "quit"

    const context: AgentContext = {
      projectRoot: garden.projectRoot,
      projectInfo: undefined,
      log: garden.log,
      garden,
      yolo: false,
    }

    const graph = createAgentGraph(context, new GlobalConfigStore(), [], {
      model: new StubChatModel() as any,
      getUserInput,
    })

    const initialState: AgentGraphState = {
      initialUserQuery: "",
      messages: [new HumanMessage(inputs.shift()!)],
      expertsConsulted: [],
      context,
      step: 0,
      userFeedback: undefined,
      tasks: [],
      currentTask: undefined,
    }

    const stream = await graph.stream(initialState, { streamMode: "debug" })

    let planTasks: string[] | undefined
    let firstRoutedExpert: string | undefined

    for await (const state of stream) {
      if (!planTasks && state.tasks.length > 0) {
        planTasks = state.tasks.map((t) => t.expert)
      }
      if (state.currentTask && !firstRoutedExpert) {
        firstRoutedExpert = state.currentTask.expert
        break // For the purpose of the test we can stop here.
      }
    }

    expect(planTasks).to.deep.equal([NODE_NAMES.KUBERNETES_AGENT, NODE_NAMES.GARDEN_AGENT])
    expect(firstRoutedExpert).to.equal(NODE_NAMES.KUBERNETES_AGENT)
  })
})
