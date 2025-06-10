/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ResponseCommand } from "../types.js"
import { NODE_NAMES, type NodeName } from "../../../types.js"
import { type Task } from "../types.js"
import type { StateAnnotation } from "../types.js"

/**
 * Simple deterministic node that looks at state.tasks, picks the first pending
 * task, marks it in-progress, sets state.currentTask and routes execution to
 * the corresponding expert.
 */
export function taskRouterNode() {
  return async (state: typeof StateAnnotation.State) => {
    const nextTask = state.tasks.find((t) => t.status === "pending")

    if (!nextTask) {
      // No tasks left – back to planner for wrap-up
      return new ResponseCommand({
        goto: NODE_NAMES.MAIN_AGENT,
        update: {},
      })
    }

    // Mark task in-progress
    const updatedTasks: Task[] = state.tasks.map((t) => (t.id === nextTask.id ? { ...t, status: "in-progress" } : t))

    return new ResponseCommand({
      goto: nextTask.expert as NodeName,
      update: {
        tasks: updatedTasks,
        currentTask: nextTask,
      },
    })
  }
}
