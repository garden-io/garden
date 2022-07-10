/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BaseTask, TaskType } from "../tasks/base"
import { LogEntry } from "../logger/log-entry"
import { GardenBaseError } from "../exceptions"
import { uuidv4 } from "../util/util"
import { DependencyGraph } from "./common"
import { Profile } from "../util/profiling"
import { TypedEventEmitter } from "../util/events"
import { BaseAction } from "../actions/base"
import { GetActionTypeResults } from "../plugin/action-types"
import { ActionTypeHandlerSpec } from "../plugin/handlers/base/base"

interface TaskEventBase {
  type: TaskType
  description: string
  key: string
  name: string
  batchId: string
  version: string
}

interface TaskStartEvent extends TaskEventBase {
  startedAt: Date
}

export interface GraphResult<A extends BaseAction = BaseAction, H extends ActionTypeHandlerSpec<any, any, any> = any>
  extends TaskEventBase {
  result: GetActionTypeResults<H> | null
  dependencyResults: GraphResults | null
  startedAt: Date | null
  completedAt: Date | null
  error: Error | null
  outputs: A["_outputs"]
}

export interface GraphResults {
  [key: string]: GraphResult | null
}

export interface SolveOpts {
  log: LogEntry
  statusOnly?: boolean
  throwOnError?: boolean
}

export interface SolveParams extends SolveOpts {
  // garden: Garden
  log: LogEntry
  tasks: BaseTask[]
}

export interface SolveResult {
  error: GraphError | null
  results: GraphResults
}

interface SolverEvents {
  solveComplete: {
    error: Error | null
    results: {
      [taskKey: string]: GraphResult
    }
  }
  start: {}
  taskComplete: GraphResult
  taskStart: TaskStartEvent
  statusComplete: GraphResult
  statusStart: TaskStartEvent
}

interface WrappedTasks {
  [key: string]: TaskWrapper
}

type CompleteHandler = (result: GraphResult) => void

@Profile()
export class GraphSolver extends TypedEventEmitter<SolverEvents> {
  // Explicitly requested tasks
  requestedTasks: WrappedTasks

  // All pending tasks, including implicit from dependencies
  pendingTasks: WrappedTasks

  private inLoop: boolean

  constructor() {
    super()
    this.inLoop = false

    this.on("start", () => {
      this.loop()
    })
  }

  async solve(params: SolveParams): Promise<SolveResult> {
    const { statusOnly, tasks, throwOnError } = params

    // const plan = await this.getPlan(params)

    const _this = this
    const batchId = uuidv4()
    const results: GraphResults = {}
    let aborted = false

    return new Promise((resolve, reject) => {
      function completeHandler(result: GraphResult) {
        if (aborted) {
          return
        }

        // We only collect the requests tasks at the top level of the result object.
        // The solver cascades errors in dependencies. So if a dependency fails, we should still always get a
        // taskComplete event for each requested task, even if an error occurs before getting to it.
        if (results[result.key] === undefined) {
          return
        }

        results[result.key] = result

        if (throwOnError && result.error) {
          // TODO: abort remaining tasks?
          aborted = true
          cleanup()
          reject(new GraphTaskError(`Failed ${result.description}: ${result.error}`, result))
          return
        }

        for (const r of Object.values(results)) {
          if (r === null) {
            // Keep going if any of the expected results are pending
            return
          }
        }

        // All requested results have been filled (i.e. none are null) so we're done.
        let error: GraphError | null = null

        const failed = Object.values(results).filter((r) => !!r?.error)

        if (failed.length > 0) {
          // TODO-G2: better aggregate error output
          let msg = `Failed to complete ${failed.length} tasks:\n`

          for (const r of failed) {
            msg += `- ${r?.description}: ${r?.error}`
          }

          error = new GraphError(msg, { results })
        }

        resolve({ error, results })
      }

      function cleanup() {
        _this.off("taskComplete", completeHandler)
      }

      const wrappers = tasks.map((t) => {
        results[t.getKey()] = null
        return this.requestTask({ task: t, batchId, statusOnly: !!statusOnly, completeHandler })
      })

      this.on("taskComplete", completeHandler)

      this.start()
    })
  }

  getDependencyGraph(params: { tasks: BaseTask[] }) {
    const { tasks } = params
    const graph = new DependencyGraph<BaseTask>()

    const addNode = (task: BaseTask) => {
      graph.addNode(task.getKey(), task)

      const deps = task.getDependencies()

      for (const dep of deps) {
        addNode(dep)
      }
    }

    for (const task of tasks) {
      graph.addNode(task.getKey(), task)
    }

    return graph
  }

  start() {
    this.emit("start", {})
  }

  private loop() {
    if (this.inLoop) {
      return
    }

    this.loop()
  }

  requestTask({
    task,
    batchId,
    statusOnly,
    completeHandler,
  }: {
    task: BaseTask
    batchId: string
    statusOnly: boolean
    completeHandler: CompleteHandler
  }) {
    const key = task.getKey()
    const existing = this.pendingTasks[key]

    if (existing) {
      if (existing.result?.completedAt) {
        completeHandler(existing.result)
      }

      if (!statusOnly && existing.statusOnly) {
        existing.statusOnly = false
      }

      return existing
    } else {
      const wrapper = new TaskWrapper(task, batchId, statusOnly)
      this.pendingTasks[key] = wrapper
      return wrapper
    }
  }

  completeTask(params: CompleteTaskParams & { task: TaskWrapper }) {
    this.emit("taskComplete", params.task.complete(params))
  }
}

class TaskWrapper<T extends BaseTask = BaseTask> {
  requestedAt: Date
  startedAt?: Date
  dependencyResults: GraphResults
  result?: GraphResult<any>

  constructor(public readonly task: T, public readonly batchId: string, public statusOnly: boolean) {
    this.requestedAt = new Date()
  }

  setDependencyResult(result: GraphResult) {
    this.dependencyResults[result.key] = result
  }

  complete({ error, result, dependencyResults, outputs }: CompleteTaskParams<T["_resultType"]>): GraphResult<any> {
    const task = this.task

    this.result = {
      type: task.type,
      description: task.getDescription(),
      key: task.getKey(),
      name: task.getName(),
      result,
      dependencyResults,
      batchId: this.batchId,
      startedAt: this.startedAt || null,
      completedAt: new Date(),
      error,
      version: this.task.version,
      outputs,
    }

    return this.result
  }
}

interface CompleteTaskParams<R = any> {
  error: Error | null
  result: R | null
  dependencyResults: GraphResults
  outputs: {}
}

interface GraphErrorDetail {
  results: GraphResults
}

class GraphError extends GardenBaseError<GraphErrorDetail> {
  type = "graph"
}

interface GraphTaskErrorDetail extends GraphResult {}

class GraphTaskError extends GardenBaseError<GraphTaskErrorDetail> {
  type = "graph"
}

class CircularDependenciesError extends GardenBaseError {
  type = "circular-dependencies"
}
