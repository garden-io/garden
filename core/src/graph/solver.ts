/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
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
import { DependencyGraph, metadataForLog } from "./common.js"
import { Profile } from "../util/profiling.js"
import { TypedEventEmitter } from "../util/events.js"
import { groupBy, keyBy } from "lodash-es"
import type { GraphResult, TaskEventBase } from "./results.js"
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
  log: Log
  tasks: T[]
}

export interface SolveResult<T extends Task = Task> {
  error: GraphResultError | null
  results: GraphResults<T>
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

    this.log = garden.log
    this.inLoop = false
    this.requestedTasks = {}
    this.nodes = {}
    this.pendingNodes = {}
    this.inProgress = {}
    this.lock = new AsyncLock()

    this.on("start", () => {
      this.log.silly(`GraphSolver: start`)
      this.emit("loop", {})
    })

    this.on("loop", () => {
      this.log.silly(`GraphSolver: loop`)
      this.loop()
    })
  }

  toSanitizedValue() {
    return "<Solver>"
  }

  async solve(params: SolveParams): Promise<SolveResult> {
    const { statusOnly, tasks, throwOnError, log } = params

    const batchId = uuidv4()
    const results = new GraphResults(tasks)
    let aborted = false

    log.silly(`GraphSolver: Starting batch ${batchId} (${tasks.length} tasks)`)

    if (tasks.length === 0) {
      return { results, error: null }
    }

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
          log.silly(`GraphSolver: Complete handler for batch ${batchId} called with result ${result.key}`)

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

          log.silly(`GraphSolver: Complete handler for batch ${batchId} matched with request ${request.getKey()}`)

          results.setResult(request.task, result)

          if (throwOnError && result.error) {
            cleanup({
              error: new GraphResultError({
                message: `Failed to ${result.description}: ${result.error}`,
                results,
                wrappedErrors: [toGardenError(result.error)],
              }),
            })
            return
          }

          const missing = results.getMissing()

          if (missing.length > 0) {
            const missingKeys = missing.map((t) => t.getBaseKey())
            log.silly(`Batch ${batchId} has ${missing.length} result(s) still missing: ${missingKeys.join(", ")}`)
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

          cleanup({ error: null })

          if (error) {
            log.silly(`Batch ${batchId} failed: ${error.message}`)
          } else {
            log.silly(`Batch ${batchId} completed`)
          }

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

  private getPendingGraph() {
    const nodes = Object.values(this.pendingNodes)
    const graph = new DependencyGraph<TaskNode>()

    const addNode = (node: TaskNode) => {
      const key = node.getKey()

      if (node.isComplete()) {
        return
      }
      graph.addNode(key, node)

      const deps = node.getRemainingDependencies()

      for (const dep of deps) {
        addNode(dep)
        graph.addDependency(key, dep.getKey())
      }
    }

    for (const node of nodes) {
      addNode(node)
    }

    return graph
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

      const graph = this.getPendingGraph()

      if (graph.size() === 0) {
        return
      }

      const leaves = graph.overallOrder(true)
      const pending = leaves.map((key) => this.nodes[key])

      const inProgressNodes = Object.values(this.inProgress)
      const inProgressByGroup = groupBy(inProgressNodes, "type")

      // Enforce concurrency limits per task type
      const grouped = groupBy(pending, (n) => n.task.type)
      const limitedByGroup = Object.values(grouped).flatMap((nodes) => {
        // Note: We can be sure there is at least one node in the array
        const groupLimit = nodes[0].task.concurrencyLimit
        const inProgress = inProgressByGroup[nodes[0].type] || []
        return nodes.slice(0, groupLimit - inProgress.length)
      })

      if (limitedByGroup.length === 0) {
        this.emit("loop", {})
        return
      }

      // Enforce hard global limit
      const nodesToProcess = limitedByGroup
        .slice(0, this.hardConcurrencyLimit - inProgressNodes.length)
        .filter((node) => !this.inProgress[node.getKey()])

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
    this.logTask(node)

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
    const request = new RequestTaskNode(params)
    if (!this.requestedTasks[params.batchId]) {
      this.requestedTasks[params.batchId] = {}
    }
    this.requestedTasks[params.batchId][request.getKey()] = request
    return request
  }

  private evaluateRequests() {
    for (const [_batchId, requests] of Object.entries(this.requestedTasks)) {
      for (const request of Object.values(requests)) {
        if (request.isComplete()) {
          continue
        }

        // See what is missing to fulfill the request, or resolve
        const task = request.task
        const statusNode = this.getNode({ type: "status", task, statusOnly: request.statusOnly })
        const status = this.getPendingResult(statusNode) as GraphResult<ValidResultType>

        if (status?.aborted || status?.error) {
          // Status is either aborted or failed
          this.log.silly(`Request ${request.getKey()} status: ${resultToString(status)}`)
          this.completeTask({ ...status, node: request })
        } else if (request.statusOnly && status !== undefined) {
          // Status is resolved, and that's all we need
          this.log.silly(`Request ${request.getKey()} is statusOnly and the status is available. Completing.`)
          this.completeTask({ ...status, node: request })
        } else if (status === undefined) {
          // We're not forcing, and we don't have the status yet, so we ensure that's pending
          this.log.silly(`Request ${request.getKey()} is missing its status.`)
          this.ensurePendingNode(statusNode, request)
        } else if (status.result?.state === "ready" && !task.force) {
          this.log.silly(`Request ${request.getKey()} has ready status and force=false, no need to process.`)
          this.completeTask({ ...status, node: request })
        } else {
          const processNode = this.getNode({ type: "process", task, statusOnly: request.statusOnly })
          const result = this.getPendingResult(processNode)

          if (result) {
            this.log.silly(`Request ${request.getKey()} has been processed.`)
            this.completeTask({ ...result, node: request })
          } else {
            this.log.silly(`Request ${request.getKey()} should be processed. Status: ${resultToString(status)}`)
            this.ensurePendingNode(processNode, request)
          }
        }
      }
    }

    const currentlyActive = Object.values(this.inProgress).map((n) => n.describe())
    this.log.silly(`Task nodes in progress: ${currentlyActive.length > 0 ? currentlyActive.join(", ") : "(none)"}`)
  }

  private ensurePendingNode(node: TaskNode, dependant: TaskNode) {
    const key = node.getKey()
    const existing = this.pendingNodes[key]

    if (!existing) {
      this.pendingNodes[key] = node
    }

    this.pendingNodes[key].addDependant(dependant)

    return this.pendingNodes[key]
  }

  private completeTask(params: CompleteTaskParams & { node: TaskNode }) {
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
  private logTask(node: TaskNode) {
    // The task.log instance is of type ActionLog but we want to use a "CoreLog" here.
    const taskLog = node.task.log.root.createLog({ name: "graph-solver" })
    taskLog.silly({
      msg: `Processing node ${taskStyle(node.getKey())}`,
      metadata: metadataForLog(node.task, "active"),
    })
  }

  private logTaskError(node: TaskNode, err: Error) {
    const log = node.task.log
    const prefix = `Failed ${node.describe()} ${renderDuration(log.getDuration())}. This is what happened:`
    this.logError(log, err, prefix)
  }

  private logInternalError(node: TaskNode, err: Error) {
    const prefix = `An internal error occurred while ${node.describe()}. This is what happened:`
    this.logError(node.task.log, err, prefix)
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
    log.silly(
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
