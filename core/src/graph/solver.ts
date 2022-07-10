/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import chalk from "chalk"
import { every, flatten, intersection, union, uniqWith, without, groupBy } from "lodash"
import { BaseTask, TaskDefinitionError, TaskType } from "../tasks/base"
import { gardenEnv } from "../constants"
import { LogEntry, LogEntryMetadata, TaskLogStatus } from "../logger/log-entry"
import { toGardenError, GardenBaseError } from "../exceptions"
import { Garden } from "../garden"
import { dedent } from "../util/string"
import { defer, relationshipClasses, uuidv4, safeDumpYaml, isDisjoint } from "../util/util"
import { renderError } from "../logger/renderers"
import { cyclesToString, DependencyGraph } from "./common"
import { Profile } from "../util/profiling"
import { renderMessageWithDivider } from "../logger/util"
import { EventEmitter2 } from "eventemitter2"
import { toGraphResultEventPayload } from "../events"
import { EventEmitter } from "eventemitter3"
import { TypedEventEmitter } from "../util/events"

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

export interface GraphResult<R = any> extends TaskEventBase {
  result: R | null
  dependencyResults: GraphResults | null
  startedAt: Date | null
  completedAt: Date | null
  error: Error | null
}

export interface GraphResults {
  [key: string]: GraphResult | null
}

interface SolveParams {
  // garden: Garden
  log: LogEntry
  tasks: BaseTask[]
  throwOnError?: boolean
}

interface SolveResult {
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
}

@Profile()
export class GraphSolver extends TypedEventEmitter<SolverEvents> {
  requestedTasks: {
    [key: string]: TaskWrapper
  }

  private inLoop: boolean

  constructor() {
    super()
    this.inLoop = false

    this.on("start", () => {
      this.loop()
    })
  }

  async solve(params: SolveParams): Promise<SolveResult> {
    const { tasks, throwOnError } = params

    // const plan = await this.getPlan(params)

    const _this = this
    const batchId = uuidv4()
    const results: GraphResults = {}

    return new Promise((resolve, reject) => {
      const wrappers = tasks.map((t) => {
        results[t.getKey()] = null
        return this.requestTask(t, batchId)
      })

      function handleTaskComplete(result: GraphResult) {
        // We only collect the requests tasks at the top level of the result object.
        // The solver cascades errors in dependencies. So if a dependency fails, we should still always get a
        // taskComplete event for each requested task, even if an error occurs before getting to it.
        if (results[result.key] === undefined) {
          return
        }

        results[result.key] = result

        if (throwOnError && result.error) {
          cleanup()
          reject(new GraphError())
        }

        for (const r of Object.values(results)) {
          if (r === null) {
            return
          }
        }

        // All requested results have been filled (i.e. none are null) so we're done.
        let error: GraphError | null = null

        // TODO-G2: prepare error more nicely
        for (const r of Object.values(results)) {
          if (r?.error) {
            error = r.error
            break
          }
        }

        resolve({ error, results })
      }

      function cleanup() {
        _this.off("taskComplete", handleTaskComplete)
      }

      this.on("taskComplete", handleTaskComplete)

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
    this.emit("start", "?")
  }

  private loop() {
    if (this.inLoop) {
      return
    }

    this.loop()
  }

  requestTask(task: BaseTask, batchId: string) {
    const key = task.getKey()

    if (this.requestedTasks[key]) {
      return this.requestedTasks[key]
    } else {
      const wrapper = new TaskWrapper(task, batchId)
      this.requestedTasks[key] = wrapper
      return wrapper
    }
  }

  completeTask(params: PrepareResultParams & { task: TaskWrapper }) {
    this.emit("taskComplete", params.task.prepareResult(params))
  }
}

class TaskWrapper<T extends BaseTask = BaseTask> {
  startedAt: Date
  completedAt: Date

  constructor(public readonly task: T, public readonly batchId: string) {}

  prepareResult({
    error,
    result,
    dependencyResults,
  }: PrepareResultParams<T["_resultType"]>): GraphResult<T["_resultType"]> {
    const task = this.task

    return {
      type: task.type,
      description: task.getDescription(),
      key: task.getKey(),
      name: task.getName(),
      result,
      dependencyResults,
      batchId: this.batchId,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      error,
      version: this.task.version,
    }
  }
}

interface PrepareResultParams<R = any> {
  error: Error | null
  result: R | null
  dependencyResults: GraphResults
}

interface GraphErrorDetail {
  errors: Error[]
  results: GraphResults
}

class GraphError extends GardenBaseError<GraphErrorDetail> {
  type = "graph"
}

class CircularDependenciesError extends GardenBaseError {
  type = "circular-dependencies"
}
