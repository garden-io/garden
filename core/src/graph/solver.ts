/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { BaseTask, Task, ValidResultType } from "../tasks/base.js"
import type { Log } from "../logger/log-entry.js"
import type { GardenError, GardenErrorParams } from "../exceptions.js"
import { GraphError, toGardenError } from "../exceptions.js"
import { uuidv4 } from "../util/random.js"
import { Profile } from "../util/profiling.js"
import { TypedEventEmitter } from "../util/events.js"
import { keyBy } from "lodash-es"
import type { GraphResult, GraphResultFromTask, TaskEventBase } from "./results.js"
import { GraphResults, resultToString } from "./results.js"
import { gardenEnv } from "../constants.js"
import type { Garden } from "../garden.js"
import type { GraphResultEventPayload } from "../events/events.js"
import { renderDivider, renderDuration, renderMessageWithDivider } from "../logger/util.js"
import type { CompleteTaskParams, InternalNodeTypes, TaskNode, TaskRequestParams } from "./nodes.js"
import { getNodeKey, ProcessTaskNode, RequestTaskNode, StatusTaskNode } from "./nodes.js"
import AsyncLock from "async-lock"
import { styles } from "../logger/styles.js"

const taskStyle = styles.highlight.bold

export interface SolveOpts {
  statusOnly?: boolean
  throwOnError?: boolean
}

export interface SolveParams<T extends BaseTask = BaseTask> extends SolveOpts {
  tasks: T[]
}

export interface SolveResult<T extends Task = Task> {
  error: GraphResultError | null
  results: GraphResults<T>
}

export interface SingleTaskSolveResult<T extends Task = Task> {
  error: GraphResultError | null
  result: GraphResultFromTask<T> | null
}

@Profile()
export class GraphSolver extends TypedEventEmitter<SolverEvents> {
  // Explicitly requested tasks
  private readonly requestedTasks: { [batchId: string]: { [key: string]: RequestTaskNode } }
  // All nodes, including implicit from dependencies
  private nodes: WrappedNodes
  // All pending nodes, including implicit from dependencies
  private pendingNodes: WrappedNodes
  // Tasks currently running
  private readonly inProgress: WrappedNodes

  private dirty: boolean
  private inLoop: boolean

  private log: Log
  private lock: AsyncLock

  constructor(
    private garden: Garden,
    // We generally limit concurrency within individual task types, but we also impose a hard limit, if only to avoid
    // thrashing the runtime for large projects, which is both sub-optimal and risks OOM crashes.
    private hardConcurrencyLimit = gardenEnv.GARDEN_HARD_CONCURRENCY_LIMIT
  ) {
    super()

    this.log = garden.log.createLog({ name: "graph-solver" })
    this.inLoop = false
    this.dirty = false
    this.requestedTasks = {}
    this.nodes = {}
    this.pendingNodes = {}
    this.inProgress = {}
    this.lock = new AsyncLock()

    this.on("start", () => {
      this.log.silly(() => `GraphSolver: start`)
      this.emit("loop", {})
    })

    this.on("loop", () => {
      this.log.silly(() => `GraphSolver: loop`)
      this.loop()
    })
  }

  toSanitizedValue() {
    return "<Solver>"
  }

  async solve(params: SolveParams): Promise<SolveResult> {
    const { statusOnly, tasks, throwOnError } = params

    const batchId = uuidv4()
    const results = new GraphResults(tasks)
    let aborted = false

    this.log.silly(() => `Starting batch ${batchId} (${tasks.length} tasks)`)

    if (tasks.length === 0) {
      return { results, error: null }
    }

    const log = this.log
    // TODO-0.13.1+: remove this lock and test with concurrent execution
    return this.lock.acquire("solve", async () => {
      const output = await new Promise<SolveResult>((resolve, reject) => {
        const requests = keyBy(
          tasks.map((t) => {
            return this.requestTask({ solver: this, task: t, batchId, statusOnly: !!statusOnly, completeHandler })
          }),
          (r) => r.task.getKey()
        )

        function completeHandler(result: GraphResult) {
          log.silly(() => `Complete handler for batch ${batchId} called with result ${result.key}`)

          if (aborted) {
            return
          }

          const request = requests[result.key]

          // We only collect the requests tasks at the top level of the result object.
          // The solver cascades errors in dependencies. So if a dependency fails, we should still always get a
          // "complete" event for each requested task, even if an error occurs before getting to it.
          if (request === undefined) {
            return
          }

          log.silly(() => `Complete handler for batch ${batchId} matched with request ${request.getKey()}`)

          results.setResult(request.task, result)

          const missing = results.getMissing()

          if (missing.length > 0) {
            const missingKeys = missing.map((t) => t.getBaseKey())
            log.silly(() => `Batch ${batchId} has ${missing.length} result(s) still missing: ${missingKeys.join(", ")}`)
            // Keep going if any of the expected results are pending
            return
          }

          // All requested results have been filled (i.e. none are null) so we're done.
          let error: GraphResultError | null = null

          const failed = Object.entries(results.getMap()).filter(([_, r]) => !!r?.error || !!r?.aborted)

          if (failed.length > 0) {
            // TODO-0.13.1: better aggregate error output
            let msg = `Failed to complete ${failed.length}/${tasks.length} tasks:`

            const wrappedErrors: GardenError[] = []

            for (const [_, r] of failed) {
              if (!r) {
                continue
              }

              if (r.error) {
                wrappedErrors.push(toGardenError(r.error))
              }

              msg += `\n ↳ ${r.description}: ${r?.error ? r.error.message : "[ABORTED]"}`
            }

            error = new GraphResultError({ message: msg, results, wrappedErrors })
          }

          if (!error) {
            log.silly(() => `Batch ${batchId} completed`)
          } else {
            log.silly(() => `Batch ${batchId} failed: ${error.message}`)

            if (throwOnError) {
              // if throwOnError is true, we reject the promise with the error.
              cleanup({ error })
              return
            }
          }

          // if throwOnError is false, we resolve the promise with the error and results.
          cleanup({ error: null })
          resolve({ error, results })
        }

        const cleanup = ({ error }: { error: GraphResultError | null }) => {
          // TODO: abort remaining pending tasks?
          aborted = true
          delete this.requestedTasks[batchId]
          this.off("abort", cleanup)
          if (error) {
            reject(error)
          }
        }

        this.on("abort", cleanup)

        this.start()
      }).finally(() => {
        // Clean up
        // TODO-0.13.1: needs revising for concurrency, shortcutting just for now
        this.nodes = {}
        this.pendingNodes = {}
      })

      return output
    })
  }

  private *getPendingLeaves(): Generator<TaskNode, undefined, undefined> {
    const nodes = Object.values(this.pendingNodes)
    const visitedKeys = new Set<string>()

    function* addNode(node: TaskNode) {
      const key = node.getKey()

      if (node.isComplete() || visitedKeys.has(key)) {
        return
      }
      visitedKeys.add(key)

      // TODO: We could optimize further by making this method a generator too.
      const deps = node.getRemainingDependencies()
      if (deps.length === 0) {
        // Leaf node found
        yield node
        return
      }

      for (const dep of deps) {
        yield* addNode(dep)
      }
    }

    for (const node of nodes) {
      yield* addNode(node)
    }
  }

  start() {
    this.emit("start", {})
  }

  clearCache() {
    // TODO-0.13.1: currently a no-op, possibly not necessary
  }

  // TODO: This should really only be visible to TaskNode instances
  getNode<N extends keyof InternalNodeTypes>({
    type,
    task,
    statusOnly,
  }: {
    type: N
    task: Task
    statusOnly: boolean
  }): InternalNodeTypes[N] {
    // Return existing node if it's there
    const key = getNodeKey(task, type)

    if (this.nodes[key]) {
      return this.nodes[key]
    }

    // Otherwise create a new one
    let node: InternalNodeTypes[N]

    if (type === "process") {
      node = new ProcessTaskNode({ solver: this, task, statusOnly })
    } else {
      node = new StatusTaskNode({ solver: this, task, statusOnly })
    }

    this.nodes[key] = node

    return node
  }

  // Note: It is important that this is not an async function
  private loop() {
    // Make sure only one instance of this function is running at any point
    if (this.inLoop) {
      return
    }
    if (!this.dirty) {
      // The graph becomes dirty when a task is requested or completed: This means that either a new task node
      // may have been added, or that a new result has been set on a node (which will affect the next graph
      // evaluation).
      return
    }
    this.inLoop = true

    try {
      this.evaluateRequests()

      for (const node of Object.values(this.pendingNodes)) {
        // For every missing dependency, ensure task is pending.
        const remainingDeps = node.getRemainingDependencies()
        for (const dep of remainingDeps) {
          this.ensurePendingNode(dep, node)
        }
      }

      const leafGenerator = this.getPendingLeaves()
      let leafCount = 0

      const inProgressNodes = Object.values(this.inProgress)

      // Enforce concurrency limits per task type and concurrency group key
      const pendingConcurrencyGroupCapacitites: { [key: string]: number } = {}

      this.dirty = false

      // We could do this with a `groupBy`, but this is more efficient (and the loop method is run frequently).
      for (const node of inProgressNodes) {
        const groupKey = node.concurrencyGroupKey
        if (!pendingConcurrencyGroupCapacitites[groupKey]) {
          pendingConcurrencyGroupCapacitites[groupKey] = 0
        }
        pendingConcurrencyGroupCapacitites[groupKey]++
      }
      const leavesLimitedByGroup: TaskNode[] = []
      for (const node of leafGenerator) {
        if (leafCount >= this.hardConcurrencyLimit - inProgressNodes.length) {
          // Enforce hard global limit. Note that we never get more leaves than this from `leafGenerator`, which can
          // save on compute in big graphs.
          break
        }
        leafCount++
        const groupKey = node.concurrencyGroupKey
        // Note: All nodes within a given concurrency group should have the same limit.
        const groupLimit = node.concurrencyLimit
        if (!pendingConcurrencyGroupCapacitites[groupKey]) {
          pendingConcurrencyGroupCapacitites[groupKey] = 0
        }
        if (pendingConcurrencyGroupCapacitites[groupKey] >= groupLimit) {
          // We've already reached the concurrency limit for this group, so we won't schedule this node now.
          continue
        }
        // There's capacity available for this group, so we schedule the node
        leavesLimitedByGroup.push(node)
        pendingConcurrencyGroupCapacitites[groupKey]++
      }
      if (leafCount === 0) {
        return
      }

      if (leavesLimitedByGroup.length === 0) {
        this.emit("loop", {})
        return
      }

      const nodesToProcess = leavesLimitedByGroup.filter((node) => !this.inProgress[node.getKey()])

      if (nodesToProcess.length === 0) {
        this.emit("loop", {})
        return
      }

      this.emit("process", {
        keys: nodesToProcess.map((n) => n.getKey()),
        inProgress: inProgressNodes.map((n) => n.getKey()),
      })

      // Process the nodes
      for (const node of nodesToProcess) {
        const key = node.getKey()
        this.inProgress[key] = node
        const startedAt = new Date()
        this.processNode(node, startedAt)
          .then(() => {
            this.emit("loop", {})
          })
          .catch((error) => {
            this.garden.events.emit("internalError", { error, timestamp: new Date() })
            this.logInternalError(node, error)
            node.complete({ startedAt, error, aborted: true, result: null })
            // Abort execution on internal error
            this.emit("abort", { error })
          })
          .finally(() => {
            delete this.inProgress[key]
          })
      }
    } finally {
      // TODO-0.13.1: clean up pending tasks with no dependant requests
      this.inLoop = false
    }
  }

  /**
   * Processes a single task to completion, handling errors and providing its result to in-progress task batches.
   */
  private async processNode(node: TaskNode, startedAt: Date) {
    this.dirty = true
    // Check for missing dependencies by calculating the input version so we can handle the exception
    // as a user error before getting deeper into the control flow (where it would result in an internal
    // error with a noisy stack trace).
    try {
      node.getInputVersion()
    } catch (error: any) {
      node.complete({ startedAt, error, aborted: true, result: null })
      return
    }

    this.log.silly(() => `Processing node ${taskStyle(node.getKey())}`)
    // TODO-performance: Record that a result or an error has become available for this node, use for looping
    // in evaluateRequests.

    try {
      const processResult = await node.execute()
      this.completeTask({ startedAt, error: null, result: processResult, node, aborted: false })
    } catch (error) {
      this.completeTask({ startedAt, error: toGardenError(error), result: null, node, aborted: false })
      if (!node.task.interactive) {
        this.logTaskError(node, toGardenError(error))
      }
    }
  }

  private requestTask(params: TaskRequestParams) {
    this.dirty = true
    const request = new RequestTaskNode(params)
    if (!this.requestedTasks[params.batchId]) {
      this.requestedTasks[params.batchId] = {}
    }
    this.requestedTasks[params.batchId][request.getKey()] = request
    return request
  }

  private evaluateRequests() {
    // TODO-performance: Only iterate over requests with new results since last loop
    for (const [_batchId, requests] of Object.entries(this.requestedTasks)) {
      for (const request of Object.values(requests)) {
        if (request.isComplete()) {
          continue
        }

        // See what is missing to fulfill the request, or resolve
        const task = request.task

        if (task.force) {
          this.log.silly(() => `Request ${request.getKey()} is force=true, processing.`)
          const processNode = this.getNode({ type: "process", task, statusOnly: request.statusOnly })
          const result = this.getPendingResult(processNode)

          if (result) {
            this.log.silly(() => `Request ${request.getKey()} has been processed.`)
            this.completeTask({ ...result, node: request })
          } else {
            this.log.silly(() => `Request ${request.getKey()} is force=true, but no result found.`)
            this.ensurePendingNode(processNode, request)
          }
          continue
        }

        const statusNode = this.getNode({ type: "status", task, statusOnly: request.statusOnly })
        const status = this.getPendingResult(statusNode) as GraphResult<ValidResultType> | undefined

        if (status?.aborted || status?.error) {
          // Status is either aborted or failed
          this.log.silly(() => `Request ${request.getKey()} status: ${resultToString(status)}`)
          this.completeTask({ ...status, node: request })
        } else if (request.statusOnly && status !== undefined && status.result) {
          // Status is resolved, and that's all we need
          this.log.silly(() => `Request ${request.getKey()} is statusOnly and the status is available. Completing.`)
          this.completeTask({ ...status, node: request })
        } else if (status === undefined) {
          // We're not forcing, and we don't have the status yet, so we ensure that's pending
          this.log.silly(() => `Request ${request.getKey()} is missing its status.`)
          this.ensurePendingNode(statusNode, request)
        } else if (status?.result?.state === "ready") {
          this.log.silly(() => `Request ${request.getKey()} has ready status and force=false, no need to process.`)
          this.completeTask({ ...status, node: request })
        } else {
          // TODO-performance: Add processing nodes for requests only once, during the solve call before looping.
          // We create exactly one request node for each requested task, so this is known up front.
          const processNode = this.getNode({ type: "process", task, statusOnly: request.statusOnly })
          const result = this.getPendingResult(processNode)

          if (result) {
            this.log.silly(() => `Request ${request.getKey()} has been processed.`)
            this.completeTask({ ...result, node: request })
          } else {
            const statusString = status ? resultToString(status) : "<none>"
            this.log.silly(() => `Request ${request.getKey()} should be processed. Status: ${statusString}`)
            this.ensurePendingNode(processNode, request)
          }
        }
      }
    }

    const currentlyActive = Object.values(this.inProgress).map((n) => n.describe())
    this.log.silly(
      () =>
        `Task nodes in progress (${currentlyActive.length}): ${currentlyActive.length > 0 ? currentlyActive.join(", ") : "(none)"}`
    )
  }

  private ensurePendingNode(node: TaskNode, dependant: TaskNode) {
    this.dirty = true
    const key = node.getKey()
    const existing = this.pendingNodes[key]

    if (!existing) {
      this.pendingNodes[key] = node
    }

    this.pendingNodes[key].addDependant(dependant)

    return this.pendingNodes[key]
  }

  private completeTask(params: CompleteTaskParams & { node: TaskNode }) {
    this.dirty = true
    const node = params.node
    const result = node.complete(params)
    delete this.inProgress[node.getKey()]

    if (node.executionType === "request" && result.success && result.result?.state === "ready") {
      node.task.emit("ready", { result: <any>result.result })
    }
    return result
  }

  private getPendingResult<T extends TaskNode>(node: T) {
    const key = node.getKey()
    const existing = this.pendingNodes[key]

    if (existing) {
      return existing.getResult()
    } else {
      return undefined
    }
  }

  //
  // Logging
  //
  private logTaskError(node: TaskNode, err: Error) {
    const log = node.task.log
    const prefix = `Failed ${node.describe()} ${renderDuration(log.getDuration())}. This is what happened:`
    this.logError(log, err, prefix)
  }

  private logInternalError(node: TaskNode, err: Error) {
    const log = node.task.log
    const prefix = `An internal error occurred while ${node.describe()} ${renderDuration(log.getDuration())}. This is what happened:`
    this.logError(log, err, prefix)
  }

  private logError(log: Log, err: Error, errMessagePrefix: string) {
    const error = toGardenError(err)
    const { msg, rawMsg } = renderMessageWithDivider({
      prefix: errMessagePrefix,
      msg: error.explain(errMessagePrefix),
      isError: true,
    })
    log.error({ msg, rawMsg, error, showDuration: false })
    const divider = renderDivider()
    log.silly(() =>
      styles.primary(`Full error with stack trace and wrapped errors:\n${divider}\n${error.toString(true)}\n${divider}`)
    )
  }
}

interface TaskStartEvent extends TaskEventBase {
  startedAt: Date
}

interface SolverEvents {
  abort: {
    error: GraphResultError | null
  }
  loop: {}
  process: {
    keys: string[]
    inProgress: string[]
  }
  taskStart: TaskStartEvent
  solveComplete: {
    error: Error | null
    results: {
      [taskKey: string]: GraphResult
    }
  }
  start: {}
  statusComplete: GraphResultEventPayload
  statusStart: TaskStartEvent
}

interface WrappedNodes {
  [key: string]: TaskNode
}

interface GraphResultErrorDetail {
  results: GraphResults
}

class GraphResultError extends GraphError {
  results: GraphResults

  constructor(params: GraphResultErrorDetail & GardenErrorParams) {
    super(params)

    this.results = params.results
  }
}
