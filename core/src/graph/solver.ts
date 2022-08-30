/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BaseTask, Task } from "../tasks/base"
import { LogEntry, LogEntryMetadata, TaskLogStatus } from "../logger/log-entry"
import { GardenBaseError, toGardenError } from "../exceptions"
import { uuidv4 } from "../util/util"
import { DependencyGraph } from "./common"
import { Profile } from "../util/profiling"
import { TypedEventEmitter } from "../util/events"
import { groupBy, keyBy } from "lodash"
import { GraphResult, GraphResults, TaskEventBase } from "./results"
import { gardenEnv } from "../constants"
import { Garden } from "../garden"
import { GraphResultEventPayload, toGraphResultEventPayload } from "../events"
import { renderError } from "../logger/renderers"
import { renderMessageWithDivider } from "../logger/util"
import chalk from "chalk"
import {
  CompleteTaskParams,
  GraphNodeError,
  ProcessTaskNode,
  RequestTaskNode,
  StatusTaskNode,
  TaskNode,
  TaskRequestParams,
} from "./nodes"
import AsyncLock from "async-lock"

const taskStyle = chalk.cyan.bold
const lock = new AsyncLock()

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
    // TODO-G2: remove this lock and test with concurrent execution
    return lock.acquire("solve", async () => {
      const { statusOnly, tasks, throwOnError } = params

      const _this = this
      const batchId = uuidv4()
      const results = new GraphResults(tasks)
      let aborted = false

      return new Promise<SolveResult>((resolve, reject) => {
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

          if (throwOnError && result.error) {
            cleanup()
            reject(new GraphNodeError(`Failed ${result.description}: ${result.error}`, result))
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
          // TODO: abort remaining tasks?
          aborted = true
          delete _this.requestedTasks[batchId]
        }

        this.start()
      })
    })
  }

  private getPendingGraph() {
    const tasks = Object.values(this.pendingTasks)
    const graph = new DependencyGraph<TaskNode>()

    const addNode = (task: TaskNode) => {
      graph.addNode(task.getKey(), task)

      const deps = task.getRemainingDependencies()

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
    // TODO-G2: currently a no-op, possibly not necessary
  }

  // Note: It is important that this is not an async function
  private loop() {
    // Make sure only one instance of this function is running at any point
    if (this.inLoop) {
      return
    }
    this.inLoop = true

    try {
      this.ensurePendingNodes()

      for (const node of Object.values(this.pendingTasks)) {
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

      if (limitedByGroup.length === 0) {
        return
      }

      // Enforce hard global limit
      const nodesToProcess = limitedByGroup.slice(0, this.hardConcurrencyLimit - inProgressNodes.length)

      this.emit("process", {
        keys: nodesToProcess.map((n) => n.getKey()),
        inProgress: inProgressNodes.map((n) => n.getKey()),
      })

      // Process the nodes
      for (const node of nodesToProcess) {
        this.inProgress[node.getKey()] = node
        this.processNode(node).catch((error) => {
          this.garden.events.emit("internalError", { error, timestamp: new Date() })
          this.logInternalError(node, error)
          node.complete({ error, aborted: true, result: null })
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
  private async processNode(node: TaskNode) {
    // Errors thrown in this outer try block are caught in loop().
    try {
      const task = node.task
      const name = task.getName()
      const type = task.type
      const key = node.getKey()

      this.logTask(node)

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

        result = this.completeTask({ error: null, result: processResult, node, aborted: false })
        result.startedAt = startedAt
      } catch (error) {
        result = this.completeTask({ error: null, result: null, node, aborted: false })
        this.garden.events.emit("taskError", toGraphResultEventPayload(result))
        if (!node.task.interactive) {
          this.logTaskError(node, error)
        }
      }
    } finally {
      this.loop()
    }
  }

  private requestTask(params: TaskRequestParams) {
    const request = new RequestTaskNode(params)
    this.requestedTasks[params.batchId][request.getKey()] = request
    return request
  }

  private ensurePendingNodes() {
    for (const [_batchId, requests] of Object.entries(this.requestedTasks)) {
      for (const request of Object.values(requests)) {
        // See what is missing to fulfill the request
        // -> Does it have its status?
        const task = request.task
        const statusNode = new StatusTaskNode({ task })
        const status = this.getPendingResult(statusNode)

        if (request.statusOnly && status !== undefined) {
          // Status is resolved, and that's all we need
          request.complete(status)
        } else if (status === undefined && !task.force) {
          // We're not forcing, and we don't have the status yet, so we ensure that's pending
          this.ensurePendingNode(statusNode, request)
        } else {
          // Need to process
          const processNode = new ProcessTaskNode({ task })
          const result = this.getPendingResult(processNode)
          if (result) {
            request.complete(result)
          } else {
            this.ensurePendingNode(processNode, request)
          }
        }
      }
    }
  }

  private ensurePendingNode(node: TaskNode, dependant: TaskNode) {
    const key = node.getKey()
    const existing = this.pendingTasks[key]

    if (!existing) {
      this.pendingTasks[key] = node
    }

    this.pendingTasks[key].addDependant(dependant)

    return this.pendingTasks[key]
  }

  private completeTask(params: CompleteTaskParams & { node: TaskNode }) {
    const result = params.node.complete(params)
    this.emit("taskComplete", toGraphResultEventPayload(result))
    return result
  }

  private getPendingResult<T extends TaskNode>(node: T) {
    const key = node.getKey()
    const existing = this.pendingTasks[key]

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
      section: "tasks",
      msg: `Processing node ${taskStyle(node.getKey())}`,
      status: "active",
      metadata: metadataForLog(node.task, "active"),
    })
  }

  private logTaskError(node: TaskNode, err: Error) {
    const prefix = `Failed ${node.describe()}. Here is the output:`
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
    log.silly({ msg: renderError(entry) })
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
  taskComplete: GraphResultEventPayload
  taskStart: TaskStartEvent
  statusComplete: GraphResultEventPayload
  statusStart: TaskStartEvent
}

interface WrappedTasks {
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
