/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { BaseTask, Task } from "../tasks/base"
import type { LogEntry, LogEntryMetadata, TaskLogStatus } from "../logger/log-entry"
import { GardenBaseError, toGardenError } from "../exceptions"
import { uuidv4 } from "../util/util"
import { DependencyGraph } from "./common"
import { Profile } from "../util/profiling"
import { TypedEventEmitter } from "../util/events"
import { groupBy, keyBy } from "lodash"
import { GraphResult, GraphResults, resultToString, TaskEventBase } from "./results"
import { gardenEnv } from "../constants"
import type { Garden } from "../garden"
import { GraphResultEventPayload, toGraphResultEventPayload } from "../events"
import { renderError } from "../logger/renderers"
import { renderDivider, renderMessageWithDivider } from "../logger/util"
import chalk from "chalk"
import {
  CompleteTaskParams,
  getNodeKey,
  InternalNodeTypes,
  ProcessTaskNode,
  RequestTaskNode,
  StatusTaskNode,
  TaskNode,
  TaskRequestParams,
} from "./nodes"
import AsyncLock from "async-lock"

const taskStyle = chalk.cyan.bold

export interface SolveOpts {
  statusOnly?: boolean
  throwOnError?: boolean
}

export interface SolveParams<T extends BaseTask = BaseTask> extends SolveOpts {
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
  private readonly requestedTasks: { [batchId: string]: { [key: string]: RequestTaskNode } }
  // All nodes, including implicit from dependencies
  private nodes: WrappedNodes
  // All pending nodes, including implicit from dependencies
  private pendingNodes: WrappedNodes
  // Tasks currently running
  private readonly inProgress: WrappedNodes

  private inLoop: boolean

  private log: LogEntry
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

  async solve(params: SolveParams): Promise<SolveResult> {
    const { statusOnly, tasks, throwOnError, log } = params

    const _this = this
    const batchId = uuidv4()
    const results = new GraphResults(tasks)
    let aborted = false

    log.silly(`GraphSolver: Starting batch ${batchId} (${tasks.length} tasks)`)

    if (tasks.length === 0) {
      return { results, error: null }
    }

    // TODO-G2: remove this lock and test with concurrent execution
    return this.lock.acquire("solve", async () => {
      const output = await new Promise<SolveResult>((resolve, reject) => {
        const requests = keyBy(
          tasks.map((t) => {
            return this.requestTask({ solver: _this, task: t, batchId, statusOnly: !!statusOnly, completeHandler })
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
          // taskComplete event for each requested task, even if an error occurs before getting to it.
          if (request === undefined) {
            return
          }

          log.silly(`GraphSolver: Complete handler for batch ${batchId} matched with request ${request.getKey()}`)

          results.setResult(request.task, result)

          if (throwOnError && result.error) {
            cleanup()
            reject(new GraphError(`Failed to ${result.description}: ${result.error}`, { results }))
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
          let error: GraphError | null = null

          const failed = Object.entries(results.getMap()).filter(([_, r]) => !!r?.error || !!r?.aborted)

          if (failed.length > 0) {
            // TODO-G2: better aggregate error output
            let msg = `Failed to complete ${failed.length}/${tasks.length} tasks:`

            for (const [_, r] of failed) {
              if (!r) {
                continue
              }
              msg += `\n ↳ ${r.description}: ${r?.error ? r.error.message : "[ABORTED]"}`
            }

            error = new GraphError(msg, { results })
          }

          cleanup()

          if (error) {
            log.silly(`Batch ${batchId} failed: ${error.message}`)
          } else {
            log.silly(`Batch ${batchId} completed`)
          }

          resolve({ error, results })
        }

        function cleanup() {
          // TODO: abort remaining pending tasks?
          aborted = true
          delete _this.requestedTasks[batchId]
        }

        this.start()
      })

      // Clean up
      // TODO-G2: needs revising for concurrency, shortcutting just for now
      this.nodes = {}
      this.pendingNodes = {}

      return output
    })
  }

  private getPendingGraph() {
    const nodes = Object.values(this.pendingNodes)
    const graph = new DependencyGraph<TaskNode>()

    const addNode = (node: TaskNode) => {
      if (node.isComplete()) {
        return
      }
      graph.addNode(node.getKey(), node)

      const deps = node.getRemainingDependencies()

      for (const dep of deps) {
        addNode(dep)
        graph.addDependency(node.getKey(), dep.getKey())
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
    // TODO-G2: currently a no-op, possibly not necessary
  }

  // TODO-G2B: This should really only be visible to TaskNode instances
  getNode<N extends keyof InternalNodeTypes>(type: N, task: Task): InternalNodeTypes[N] {
    // Return existing node if it's there
    const key = getNodeKey(task, type)

    if (this.nodes[key]) {
      return this.nodes[key]
    }

    // Otherwise create a new one
    let node: InternalNodeTypes[N]

    if (type === "process") {
      node = new ProcessTaskNode({ solver: this, task })
    } else {
      node = new StatusTaskNode({ solver: this, task })
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
        return
      }

      // Enforce hard global limit
      const nodesToProcess = limitedByGroup
        .slice(0, this.hardConcurrencyLimit - inProgressNodes.length)
        .filter((node) => !this.inProgress[node.getKey()])

      if (nodesToProcess.length === 0) {
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
            this.emit("loop", {})
          })
      }
    } finally {
      // TODO-G2: clean up pending tasks with no dependant requests
      this.inLoop = false
    }
  }

  /**
   * Processes a single task to completion, handling errors and providing its result to in-progress task batches.
   */
  private async processNode(node: TaskNode, startedAt: Date) {
    // Errors thrown in this outer try block are caught in loop().
    const task = node.task
    const name = task.getName()
    const type = task.type
    const key = node.getKey()

    this.logTask(node)

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
      result = this.completeTask({ startedAt, error: null, result: processResult, node, aborted: false })
    } catch (error) {
      result = this.completeTask({ startedAt, error, result: null, node, aborted: false })
      this.garden.events.emit("taskError", toGraphResultEventPayload(result))
      if (!node.task.interactive) {
        this.logTaskError(node, error)
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
        const statusNode = this.getNode("status", task)
        const status = this.getPendingResult(statusNode)

        if (status?.aborted || status?.error) {
          // Status is either aborted or failed
          this.log.silly(`Request ${request.getKey()} status: ${resultToString(status)}`)
          request.complete(status)
        } else if (request.statusOnly && status !== undefined) {
          // Status is resolved, and that's all we need
          this.log.silly(`Request ${request.getKey()} is statusOnly and the status is available. Completing.`)
          request.complete(status)
        } else if (status === undefined) {
          // We're not forcing, and we don't have the status yet, so we ensure that's pending
          this.log.silly(`Request ${request.getKey()} is missing its status.`)
          this.ensurePendingNode(statusNode, request)
          // TODO-G2: The state should be a top-level field
        } else if (status.result?.state === "ready" && !task.force) {
          this.log.silly(`Request ${request.getKey()} has ready status and force=false, no need to process.`)
          request.complete(status)
        } else {
          const processNode = this.getNode("process", task)
          const result = this.getPendingResult(processNode)

          if (result) {
            this.log.silly(`Request ${request.getKey()} has been processed.`)
            request.complete(result)
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
    const result = params.node.complete(params)
    delete this.inProgress[params.node.getKey()]
    this.emit("taskComplete", toGraphResultEventPayload(result))
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
    node.task.log.silly({
      section: "graph-solver",
      msg: `Processing node ${taskStyle(node.getKey())}`,
      status: "active",
      metadata: metadataForLog(node.task, "active"),
    })
  }

  private logTaskError(node: TaskNode, err: Error) {
    const prefix = `Failed to ${node.describe()}. Here is the output:`
    this.logError(node.task.log, err, prefix)
  }

  private logInternalError(node: TaskNode, err: Error) {
    const prefix = `An internal error occurred while ${node.describe()}. Here is the output:`
    this.logError(node.task.log, err, prefix)
  }

  private logError(log: LogEntry, err: Error, errMessagePrefix: string) {
    const error = toGardenError(err)
    const errorMessage = error.message.trim()
    const msg = renderMessageWithDivider(errMessagePrefix, errorMessage, true)
    // TODO-G2: pass along log entry here instead of using Garden logger
    const entry = log.error({ msg, error })
    const divider = renderDivider()
    log.silly({ msg: chalk.gray(`Full error with stack trace:\n${divider}\n${renderError(entry)}\n${divider}`) })
  }

  // // Overriding to ease debugging
  // emit<N extends keyof SolverEvents>(event: N, payload: SolverEvents[N]): boolean {
  //   this.log.silly(`Emit event ${event} with payload ${JSON.stringify(payload)}`)
  //   return super.emit(event, payload)
  // }
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
  taskComplete: GraphResultEventPayload
  taskStart: TaskStartEvent
  statusComplete: GraphResultEventPayload
  statusStart: TaskStartEvent
}

interface WrappedNodes {
  [key: string]: TaskNode
}

interface GraphErrorDetail {
  results: GraphResults
}

class GraphError extends GardenBaseError<GraphErrorDetail> {
  type = "graph"
}

// class CircularDependenciesError extends GardenBaseError {
//   type = "circular-dependencies"
// }

function metadataForLog(task: Task, status: TaskLogStatus): LogEntryMetadata {
  return {
    task: {
      type: task.type,
      key: task.getKey(),
      status,
      uid: task.uid,
      versionString: task.version,
    },
  }
}
