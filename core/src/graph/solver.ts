/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BaseTask, Task } from "../tasks/base"
import { LogEntry } from "../logger/log-entry"
import { GardenBaseError } from "../exceptions"
import { uuidv4 } from "../util/util"
import { DependencyGraph } from "./common"
import { Profile } from "../util/profiling"
import { TypedEventEmitter } from "../util/events"
import { keyBy } from "lodash"
import { GraphResult, GraphResults, TaskEventBase } from "./results"

export interface SolveOpts {
  statusOnly?: boolean
  throwOnError?: boolean
}

export interface SolveParams<T extends Task = Task> extends SolveOpts {
  log: LogEntry
  tasks: T[]
}

export interface SolveResult<T extends Task = Task> {
  error: GraphError | null
  results: GraphResults<T>
}

@Profile()
export class GraphSolver extends TypedEventEmitter<SolverEvents> {
  // Explicitly requested tasks
  private readonly requestedTasks: { [key: string]: TaskRequest }

  // All pending tasks, including implicit from dependencies
  private readonly pendingTasks: WrappedTasks

  private inLoop: boolean

  constructor() {
    super()

    this.inLoop = false
    this.requestedTasks = {}
    this.pendingTasks = {}

    this.on("start", () => {
      this.loop()
    })
  }

  async solve(params: SolveParams): Promise<SolveResult> {
    const { statusOnly, tasks, throwOnError } = params

    // const plan = await this.getPlan(params)

    const _this = this
    const batchId = uuidv4()
    const results = new GraphResults(tasks)
    let aborted = false

    return new Promise((resolve, reject) => {
      const requests = keyBy(
        tasks.map((t) => {
          results[t.getKey()] = null
          return this.requestTask({ task: t, batchId, statusOnly: !!statusOnly, completeHandler })
        }),
        (r) => r.task.getKey()
      )

      function completeHandler(result: GraphResult) {
        if (aborted) {
          return
        }

        const request = requests[result.key]

        // We only collect the requests tasks at the top level of the result object.
        // The solver cascades errors in dependencies. So if a dependency fails, we should still always get a
        // taskComplete event for each requested task, even if an error occurs before getting to it.
        if (request === undefined) {
          return
        }

        results.setResult(request.task, result)

        if (throwOnError && result.error) {
          // TODO: abort remaining tasks?
          aborted = true
          cleanup()
          reject(new GraphTaskError(`Failed ${result.description}: ${result.error}`, result))
          return
        }

        for (const r of Object.values(results)) {
          if (!r) {
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

  clearCache() {
    // TODO-G2
    throw "TODO"
  }

  private loop() {
    if (this.inLoop) {
      return
    }

    this.inLoop = true

    try {
      // this.loop()
    } finally {
      this.inLoop = false
    }
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
    const request = new TaskRequest({ task, batchId, statusOnly })
    this.requestedTasks[request.key()] = request

    const key = task.getKey()
    const existing = this.pendingTasks[key]

    if (existing) {
      if (existing.result?.completedAt) {
        completeHandler(existing.result)
      }

      if (!statusOnly && existing.statusOnly) {
        existing.statusOnly = false
      }
    } else {
      const wrapper = new TaskWrapper(task, statusOnly)
      this.pendingTasks[key] = wrapper
    }

    return request
  }

  completeTask(params: CompleteTaskParams & { task: TaskWrapper }) {
    this.emit("taskComplete", params.task.complete(params))
  }
}

interface TaskRequestParams<T extends BaseTask = BaseTask> {
  task: T
  batchId: string
  statusOnly: boolean
}

class TaskRequest<T extends BaseTask = BaseTask> {
  public readonly requestedAt: Date
  public readonly task: T
  public readonly batchId: string
  public readonly statusOnly: boolean

  constructor(params: TaskRequestParams<T>) {
    this.requestedAt = new Date()
    this.task = params.task
    this.batchId = params.batchId
    this.statusOnly = params.statusOnly
  }

  key() {
    return `${this.task.getKey()}.${this.batchId}`
  }
}

class TaskWrapper<T extends BaseTask = BaseTask> {
  startedAt?: Date
  dependencyResults: GraphResults
  result?: GraphResult<any>

  constructor(public readonly task: T, public statusOnly: boolean) {}

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
      // batchId: this.batchId,
      startedAt: this.startedAt || null,
      completedAt: new Date(),
      error,
      version: this.task.version,
      outputs,
      task,
    }

    return this.result
  }
}

interface TaskStartEvent extends TaskEventBase {
  startedAt: Date
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
