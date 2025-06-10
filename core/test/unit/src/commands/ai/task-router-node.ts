/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { taskRouterNode } from "../../../../../src/commands/ai/agents/langgraph/nodes/task-router-node.js"
import { NODE_NAMES, type NodeName } from "../../../../../src/commands/ai/types.js"
import type { Task } from "../../../../../src/commands/ai/agents/langgraph/types.js"

function makeTask(id: string, expert: NodeName, status: "pending" | "in-progress" | "done" = "pending"): Task {
  return { id, expert, description: id, status }
}

describe("taskRouterNode", () => {
  it("should pick the first pending task, mark it in-progress and route", async () => {
    const state = {
      tasks: [makeTask("1", NODE_NAMES.KUBERNETES_AGENT, "pending"), makeTask("2", NODE_NAMES.GARDEN_AGENT, "pending")],
      currentTask: undefined,
    } as any // minimal shape for the router

    const router = taskRouterNode()
    const res: any = await router(state)

    expect(res.goto).to.deep.equal([NODE_NAMES.KUBERNETES_AGENT])
    expect(res.update!.tasks[0].status).to.equal("in-progress")
    expect(res.update!.currentTask.id).to.equal("1")
  })

  it("should send flow back to planner when all tasks done", async () => {
    const state = {
      tasks: [makeTask("1", NODE_NAMES.KUBERNETES_AGENT, "done")],
      currentTask: undefined,
    } as any

    const resAny: any = await taskRouterNode()(state)
    expect(resAny.goto).to.deep.equal([NODE_NAMES.MAIN_AGENT])
  })
})
