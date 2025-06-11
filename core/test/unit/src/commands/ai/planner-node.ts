/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { PlannerNode } from "../../../../../src/commands/ai/agents/langgraph/nodes/planner-node.js"
import { NODE_NAMES, type AgentContext } from "../../../../../src/commands/ai/types.js"
import type { Task } from "../../../../../src/commands/ai/agents/langgraph/types.js"

// Minimal stub model – not used for the branches we test.
class DummyModel {
  bindTools() {
    return { invoke: async () => ({ tool_calls: [] }) }
  }
  withStructuredOutput() {
    return { invoke: async () => ({ response: "", goto: NODE_NAMES.HUMAN_LOOP }) }
  }
}

function makePendingTask(id: string, expert = NODE_NAMES.KUBERNETES_AGENT): Task {
  return { id, description: id, expert, status: "pending" }
}

describe("PlannerNode (logic branches)", () => {
  const context = {
    anthropic: {} as any,
    projectRoot: "/tmp",
    log: {
      info() {},
      debug() {},
      error() {},
      warn() {},
      createLog: () => ({ info() {}, debug() {}, error() {}, warn() {} }),
    } as any,
    garden: {} as any,
    yolo: false,
  } satisfies Partial<AgentContext> as AgentContext

  it("should hand off to TASK_ROUTER when there are pending tasks", async () => {
    const planner = new PlannerNode(context, new DummyModel() as any)
    const node = planner.makeNode({ endNodeName: NODE_NAMES.HUMAN_LOOP })

    const state = {
      tasks: [makePendingTask("1")],
      messages: [],
      step: 0,
      expertsConsulted: [],
      context,
      currentTask: undefined,
    } as any

    const res: any = await node(state)
    expect(res.goto).to.deep.equal([NODE_NAMES.TASK_ROUTER])
  })

  it("should summarise and ask for feedback when all tasks done", async () => {
    const planner = new PlannerNode(context, new DummyModel() as any)
    const node = planner.makeNode({ endNodeName: NODE_NAMES.HUMAN_LOOP })

    const state = {
      tasks: [{ id: "1", description: "d", expert: NODE_NAMES.KUBERNETES_AGENT, status: "done", summary: "ok" }],
      messages: [],
      step: 2,
      expertsConsulted: [],
      context,
      currentTask: undefined,
    } as any

    const res: any = await node(state)
    expect(res.goto).to.deep.equal([NODE_NAMES.HUMAN_LOOP])
  })
})
