/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BaseTask, Task } from "../tasks/base"
import { LogEntry } from "../logger/log-entry"
import { GardenBaseError, InternalError } from "../exceptions"
import { uuidv4 } from "../util/util"
import { DependencyGraph } from "./common"
import { Profile } from "../util/profiling"
import { TypedEventEmitter } from "../util/events"
import { groupBy, keyBy } from "lodash"
import { GraphResult, GraphResults, TaskEventBase } from "./results"
import { gardenEnv } from "../constants"
import { Garden } from "../garden"
import { toGraphResultEventPayload } from "../events"

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
  private readonly requestedTasks: { [batchId: string]: { [key: string]: TaskRequest } }
  // All pending tasks, including implicit from dependencies
  private readonly pendingTasks: WrappedTasks
  // Tasks currently running
  private readonly inProgress: WrappedTasks

  private inLoop: boolean

  constructor(
    private garden: Garden,
    // We generally limit concurrency within individual task types, but we also impose a hard limit, if only to avoid
    // thrashing the runtime for large projects, which is both sub-optimal and risks OOM crashes.
    private hardConcurrencyLimit = gardenEnv.GARDEN_HARD_CONCURRENCY_LIMIT
  ) {
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
          results[t.getBaseKey()] = null
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
        delete _this.requestedTasks[request.key()] // Maybe belongs elsewhere?

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

  private getPendingGraph() {
    const tasks = Object.values(this.pendingTasks)
    const graph = new DependencyGraph<TaskNode>()

    const addNode = (task: TaskNode) => {
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

  // Note: It is important that this is not an async function
  private loop() {
    // Make sure only one instance of this function is running at any point
    if (this.inLoop) {
      return
    }
    this.inLoop = true

    try {
      for (const [batchId, requests] of Object.entries(this.requestedTasks)) {
        for (const request of Object.values(requests)) {
          // See what is missing to fulfill the request
          // -> Does it have its status?
          //   -> If yes, and request is status only, resolve
          //   -> What's needed to call getStatus?
          // -> Does it need a result?
          //   -> Is it there? If yes, resolve.
          // Are we executing and explicit dependencies remain?
          // -> If nothing remains, resolve the request and remove
          // -> For every missing dependency or status call, ensure task is pending
        }
      }

      for (const pending of Object.values(this.pendingTasks)) {
        // See what is missing to fulfill the task
        // -> For every missing dependency, ensure task is pending
      }

      const graph = this.getPendingGraph()

      if (graph.size() === 0) {
        this.inLoop = false
        return
      }

      const leaves = graph.overallOrder(true)
      const pending = leaves.map((key) => this.pendingTasks[key])

      const inProgressNodes = Object.values(this.inProgress)
      const inProgressByGroup = groupBy(inProgressNodes, "type")

      // Enforce concurrency limits per task type
      const grouped = groupBy(pending, "type")
      const limitedByGroup = Object.values(grouped).flatMap((nodes) => {
        // Note: We can be sure there is at least one node in the array
        const groupLimit = nodes[0].task.concurrencyLimit
        const inProgress = inProgressByGroup[nodes[0].type] || []
        return nodes.slice(0, groupLimit - inProgress.length)
      })

      // Enforce hard global limit
      const nodesToProcess = limitedByGroup.slice(0, this.hardConcurrencyLimit - inProgressNodes.length)

      this.emit("process", {
        keys: nodesToProcess.map((n) => n.key),
        inProgress: inProgressNodes.map((n) => n.key),
      })

      // Process the nodes
      for (const node of nodesToProcess) {
        this.inProgress[node.key] = node
        this.processNode(node).catch((error) => {
          this.garden.events.emit("internalError", { error, timestamp: new Date() })
          this.logInternalError(node, error)
          this.cancelDependants(node)
        })
      }
    } finally {
      // TODO-G2: clean up pending tasks with no dependant requests

      this.inLoop = false
      this.loop()
    }
  }

  /**
   * Processes a single task to completion, handling errors and providing its result to in-progress task batches.
   */
  private async processNode(node: TaskNode) {
    let success = true

    // Errors thrown in this outer try block are caught in loop().
    try {
      const task = node.task
      const name = task.getName()
      const type = task.type
      const key = node.key
      const description = node.task.getDescription()
      const version = node.task.version

      // TODO-G2
      // this.logTask(node)
      // this.logEntryMap.inProgress.setState(inProgressToStr(this.inProgress.getNodes()))

      const startedAt = new Date()

      let result: GraphResult

      try {
        this.garden.events.emit("taskProcessing", {
          name,
          type,
          key,
          startedAt: new Date(),
          versionString: task.version,
        })
        const processResult = await node.execute()

        result = this.completeTask({ error: null, result: processResult, task: node })
        result.startedAt = startedAt

        this.garden.events.emit("taskComplete", toGraphResultEventPayload(result))
      } catch (error) {
        success = false
        result = { type, description, key, name, error, startedAt, completedAt: new Date(), batchId, version }
        this.garden.events.emit("taskError", toGraphResultEventPayload(result))
        if (!node.task.interactive) {
          this.logTaskError(node, error)
        }
        this.cancelDependants(node)
      } finally {
        this.resultCache.put(key, node.getVersion(), result)
        this.provideResultToInProgressBatches(result)
      }
    } finally {
      this.loop()
    }
  }

  private requestTask(params: RequestTaskParams) {
    const request = new TaskRequest(params)
    this.requestedTasks[params.batchId][request.key()] = request
    this.registerTask(params)
    return request
  }

  private registerTask({ task, statusOnly, completeHandler }: RegisterTaskParams) {
    const key = task.getKey()
    const existing = this.pendingTasks[key]

    if (existing) {
      const result = existing.getResult()
      if (result?.completedAt) {
        completeHandler(result)
      }
      if (!statusOnly && existing.statusOnly) {
        existing.statusOnly = false
      }
    } else {
      // TODO-G2: detect circular deps here
      const dependencies = task
        .getProcessDependencies()
        .map((dep) => this.registerTask({ task: dep, statusOnly, completeHandler }))
      const node = new TaskNode({ task, statusOnly, dependencies })
      this.pendingTasks[key] = node
    }

    return this.pendingTasks[key]
  }

  private completeTask(params: CompleteTaskParams & { task: TaskNode }) {
    const result = params.task.complete(params)
    this.emit("taskComplete", result)
    return result
  }
}

interface RegisterTaskParams {
  task: BaseTask
  statusOnly: boolean
  completeHandler: CompleteHandler
}

interface RequestTaskParams extends RegisterTaskParams {
  batchId: string
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
    return `${this.task.getBaseKey()}.${this.batchId}`
  }
}

type ExecutionType = "status" | "process"

interface TaskNodeParams<T extends Task> {
  task: T
}

abstract class TaskNode<E extends ExecutionType = ExecutionType, T extends Task = Task> {
  abstract readonly executionType: E

  public readonly type: string
  public startedAt?: Date
  public readonly task: T

  protected dependencyResults: { [key: string]: GraphResult<any> }
  protected result?: GraphResult<any>

  constructor({ task }: TaskNodeParams<T>) {
    this.task = task
    this.type = task.type
  }

  abstract getDependencies(): TaskNode[]
  abstract execute(): Promise<T["_resultType"] | null>

  getKey() {
    return `${this.task.getKey()}:${this.executionType}`
  }

  getDependencyResult<A extends ExecutionType, B extends Task>(
    node: TaskNode<A, B>
  ): GraphResult<B["_resultType"]> | undefined {
    const key = node.getKey()
    return this.dependencyResults[key]
  }

  setDependencyResult(result: GraphResult) {
    this.dependencyResults[result.key] = result
  }

  getDependencyResults(): GraphResults {
    const deps = this.getDependencies()
    const results = new GraphResults(deps.map((d) => d.task))

    for (const dep of deps) {
      const result = this.getDependencyResult(dep)

      if (!result) {
        const baseKey = dep.task.getBaseKey()
        throw new InternalError(`Could not find result for task ${baseKey}`, { baseKey })
      }

      results.setResult(dep.task, result)
    }

    return results
  }

  complete({ error, result, aborted }: CompleteTaskParams<T["_resultType"]>): GraphResult<any> {
    const task = this.task

    this.result = {
      type: task.type,
      description: task.getDescription(),
      key: task.getKey(),
      name: task.getName(),
      result,
      dependencyResults: this.getDependencyResults(),
      aborted,
      startedAt: this.startedAt || null,
      completedAt: new Date(),
      error,
      version: this.task.version,
      outputs: result?.outputs,
      task,
    }

    return this.result
  }

  /**
   * Returns the task result if the task is completed. Returns undefined if result is not available.
   */
  getResult() {
    return this.result
  }
}

class ProcessTaskNode<T extends BaseTask = BaseTask> extends TaskNode<"process", T> {
  executionType: "process" = "process"

  getDependencies() {
    // We first resolve the status
    const statusTask = new StatusTaskNode({ task: this.task })
    const statusResult = this.getDependencyResult(statusTask)

    if (!statusResult) {
      return [statusTask]
    }

    if (statusResult.result?.state === "ready") {
      // No dependencies needed if status is ready
      return []
    }

    const processDeps = this.task.getProcessDependencies()
    return processDeps.map((task) => new ProcessTaskNode({ task }))
  }

  async execute() {
    return this.task.process({ dependencyResults: this.getDependencyResults() })
  }
}

class StatusTaskNode<T extends BaseTask = BaseTask> extends TaskNode<"status", T> {
  executionType: "status" = "status"

  getDependencies() {
    const statusDeps = this.task.getStatusDependencies()
    return statusDeps.map((task) => new StatusTaskNode({ task }))
  }

  async execute() {
    return this.task.getStatus({ dependencyResults: this.getDependencyResults() })
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
  [key: string]: TaskNode
}

type CompleteHandler = (result: GraphResult) => void

interface CompleteTaskParams<R = any> {
  error: Error | null
  result: R | null
  aborted: boolean
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
