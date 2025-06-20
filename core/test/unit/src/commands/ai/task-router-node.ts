/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { taskRouterNode } from "../../../../../src/commands/ai/agents/langgraph/nodes/task-router-node.js"
import { NODE_NAMES, type NodeName, type AgentContext } from "../../../../../src/commands/ai/types.js"
import type { Task, AgentGraphState } from "../../../../../src/commands/ai/agents/langgraph/types.js"
import type { Log } from "../../../../../src/logger/log-entry.js"
import type { Garden } from "../../../../../src/garden.js"

// Minimal stub logger adhering to the Log interface via casting
const stubLogBase = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  createLog: () => ({}) as unknown as Log,
}
const stubLog = stubLogBase as unknown as Log

// Minimal stub context for tests
const testContext: AgentContext = {
  projectRoot: "/tmp",
  log: stubLog,
  garden: null as unknown as Garden,
  yolo: false,
}

function makeTask(id: string, expert: NodeName, status: "pending" | "in-progress" | "done" = "pending"): Task {
  return { id, expert, description: id, status }
}

describe("taskRouterNode", () => {
  it("should pick the first pending task, mark it in-progress and route", async () => {
    const state: Record<string, unknown> = {
      tasks: [makeTask("1", NODE_NAMES.KUBERNETES_AGENT, "pending"), makeTask("2", NODE_NAMES.GARDEN_AGENT, "pending")],
      currentTask: undefined,
    }

    const router = taskRouterNode(testContext)
    const res = await router(state as AgentGraphState)

    expect(res.goto).to.deep.equal([NODE_NAMES.KUBERNETES_AGENT])
    const update = res.update as { tasks: Task[]; currentTask: Task }
    expect(update.tasks[0].status).to.equal("in-progress")
    expect(update.currentTask.id).to.equal("1")
  })

  it("should send flow back to planner when all tasks done", async () => {
    const state: Record<string, unknown> = {
      tasks: [makeTask("1", NODE_NAMES.KUBERNETES_AGENT, "done")],
      currentTask: undefined,
    }

    const res = await taskRouterNode(testContext)(state as AgentGraphState)
    expect(res.goto).to.deep.equal([NODE_NAMES.MAIN_AGENT])
  })
})
