/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Task, TaskResultType, ValidResultType } from "../tasks/base.js"
import { GraphError, InternalError, toGardenError } from "../exceptions.js"
import type { GraphResult, GraphResultFromTask } from "./results.js"
import { GraphResults } from "./results.js"
import type { GraphSolver } from "./solver.js"
import { metadataForLog } from "./common.js"
import { Profile } from "../util/profiling.js"
import { styles } from "../logger/styles.js"
import { gardenEnv } from "../constants.js"

export interface InternalNodeTypes {
  status: StatusTaskNode
  process: ProcessTaskNode
}

export interface NodeTypes extends InternalNodeTypes {
  request: RequestTaskNode
}

export type NodeType = keyof NodeTypes

export interface TaskNodeParams<T extends Task> {
  solver: GraphSolver
  task: T
  dependant?: TaskNode
  statusOnly: boolean
}

@Profile()
export abstract class TaskNode<T extends Task = Task> {
  abstract readonly executionType: NodeType
  public readonly type: string
  public startedAt?: Date
  public readonly task: T
  public readonly statusOnly: boolean

  public abstract readonly concurrencyLimit: number
  public abstract readonly concurrencyGroupKey: string

  protected solver: GraphSolver
  protected dependants: { [key: string]: TaskNode }
  protected result?: GraphResult<any>

  constructor({ solver, task, statusOnly }: TaskNodeParams<T>) {
    this.task = task
    this.type = task.type
    this.solver = solver
    this.statusOnly = statusOnly
    this.dependants = {}
  }

  abstract describe(): string
  abstract getDependencies(): TaskNode[]
  abstract execute(): Promise<TaskResultType<T> | null>

  getKey() {
    return getNodeKey(this.task, this.executionType)
  }

  addDependant(node: TaskNode) {
    const key = node.getKey()
    if (!this.dependants[key]) {
      this.dependants[key] = node
    }
  }

  /**
   * Returns all dependencies that does not yet have a result, i.e. is not resolved.
   */
  getRemainingDependencies(): TaskNode[] {
    return this.getDependencies().filter((d) => this.getDependencyResult(d) === undefined)
  }

  /**
   * Get the result for the given dependency node. Returns undefined if result is not yet set.
   */
  getDependencyResult<A extends Task>(node: TaskNode<A>): GraphResult<TaskResultType<T>> | undefined {
    return node.getResult()
  }

  /**
   * Returns all dependency results.
   */
  getDependencyResults(): GraphResults {
    const deps = this.getDependencies()
    const results = new GraphResults(deps.map((d) => d.task))

    for (const dep of deps) {
      const result = this.getDependencyResult(dep)
      result && results.setResult(dep.task, result)
    }

    return results
  }

  isComplete() {
    return !!this.result
  }

  /**
   * Completes the node, setting its result and propagating it to each dependant node.
   *
   * If the node is aborted or an error is set, dependants are aborted.
   *
   * If the node was already completed, this is a no-op (may e.g. happen if the node has been completed
   * but a dependency fails and is aborting dependants).
   */
  complete({ startedAt, error, result, aborted, abortedKeys }: CompleteTaskParams): GraphResult<TaskResultType<T>> {
    if (this.result) {
      return this.result
    }

    const task = this.task
    const dependencyResults = this.getDependencyResults()
    let inputVersion: string | null
    try {
      inputVersion = task.getInputVersion()
    } catch (_e) {
      inputVersion = null
    }

    task.log.silly({
      msg: `Completing node ${styles.underline(this.getKey())}. aborted=${aborted}, error=${
        error ? error.message : null
      }`,
      metadata: metadataForLog({
        task,
        status: error ? "error" : "success",
        inputVersion,
      }),
    })

    this.result = {
      type: task.type,
      description: task.getDescription(),
      key: task.getKey(),
      name: task.getName(),
      result,
      dependencyResults: dependencyResults.filterForGraphResult(),
      aborted,
      didRun: (result?.didRun === true && this.executionType === "process") || false,
      cacheInfo: result?.cacheInfo,
      startedAt,
      completedAt: new Date(),
      error,
      inputVersion,
      outputs: result?.outputs,
      task,
      processed: this.executionType === "process",
      success: !error && !aborted,
      attached: !!result?.attached,
      runReason: result?.runReason || "",
    }

    if (aborted || error) {
      // We abort every dependant, and complete the corresponding request node for the failed node with an error.
      const keys = abortedKeys || new Set<string>([task.getKey()])
      for (const d of Object.values(this.dependants)) {
        const depKey = d.task.getKey()
        let depAborted: boolean
        let depError: Error | null
        if (depKey === task.getKey() && d.executionType === "request" && error) {
          depAborted = false
          depError = new GraphNodeError({ resultError: error, node: d })
        } else {
          depAborted = true
          depError = null
          if (!keys.has(depKey)) {
            d.task.log.info({
              msg: `Aborting because upstream dependency failed.`,
              metadata: metadataForLog({ task: d.task, status: "error", inputVersion: null }),
            })
            keys.add(depKey)
          }
        }
        d.complete({
          startedAt,
          aborted: depAborted,
          result: null,
          error: depError,
          abortedKeys: keys,
        })
      }
    }

    return this.result!
  }

  /**
   * Returns the task result if the task is completed. Returns undefined if result is not available.
   */
  getResult() {
    return this.result
  }

  getInputVersion() {
    return this.task.getInputVersion()
  }

  protected getNode<NT extends keyof InternalNodeTypes>(type: NT, task: Task): InternalNodeTypes[NT] {
    return this.solver.getNode({ type, task, statusOnly: this.statusOnly })
  }
}

export interface TaskRequestParams<T extends Task = Task> extends TaskNodeParams<T> {
  batchId: string
  statusOnly: boolean
  completeHandler: CompleteHandler<TaskResultType<T>>
}

@Profile()
export class RequestTaskNode<TaskType extends Task = Task> extends TaskNode<TaskType> {
  readonly executionType: NodeType = "request"

  override get concurrencyLimit() {
    return gardenEnv.GARDEN_HARD_CONCURRENCY_LIMIT
  }

  override get concurrencyGroupKey() {
    return this.executionType
  }

  public readonly requestedAt: Date
  public readonly batchId: string

  private completeHandler: CompleteHandler<TaskResultType<TaskType>>

  constructor(params: TaskRequestParams<TaskType>) {
    super(params)
    this.requestedAt = new Date()
    this.batchId = params.batchId
    this.completeHandler = params.completeHandler
  }

  describe() {
    return this.task.getDescription()
  }

  override getKey() {
    return `${this.task.getBaseKey()}:request:${this.batchId}`
  }

  getDependencies(): TaskNode[] {
    if (this.statusOnly) {
      return [this.getNode("status", this.task)]
    } else {
      return [this.getNode("process", this.task)]
    }
  }

  override complete(params: CompleteTaskParams): GraphResult<TaskResultType<TaskType>> {
    const result = super.complete(params)
    this.completeHandler(result)
    return result
  }

  // NOT USED
  async execute() {
    return null
  }
}

@Profile()
export class ProcessTaskNode<T extends Task = Task> extends TaskNode<T> {
  readonly executionType: NodeType = "process"

  override get concurrencyLimit() {
    return this.task.executeConcurrencyLimit
  }

  /**
   * Tasks with different limits will be grouped in separate concurrency groups.
   *
   * E.g. if 50 build tasks have limit of 5, and 30 build tasks have limit of 10, then 15 build tasks will execute concurrently.
   */
  override get concurrencyGroupKey() {
    return `${this.executionType}-${this.task.type}-${this.task.executeConcurrencyLimit}`
  }

  describe() {
    return `processing ${this.task.getDescription()}`
  }

  getDependencies() {
    const statusTask = this.getNode("status", this.task)
    const statusResult = this.getDependencyResult(statusTask) as GraphResult<any>

    if (statusResult === undefined) {
      // Status is still missing
      return [statusTask]
    }

    // Either forcing, or status is not ready
    const processDeps = this.task.getProcessDependencies({ status: statusResult.result })
    return processDeps.map((task) => this.getNode("process", task))
  }

  async execute() {
    this.task.log.silly(() => `Executing node ${styles.underline(this.getKey())}`)

    const statusTask = this.getNode("status", this.task)
    // TODO: make this more type-safe
    const statusResult = this.getDependencyResult(statusTask) as GraphResultFromTask<T>

    if (statusResult === undefined) {
      throw new InternalError({
        message: `Attempted to execute ${this.describe()} before resolving status.`,
      })
    }

    const status = statusResult.result

    if (this.task.getKey() === "test.backend-test") {
      console.log(statusResult.result)
    }

    if (!this.task.force && status?.state === "ready") {
      return status
    }

    const dependencyResults = this.getDependencyResults()

    try {
      const processResult: TaskResultType<T> = await this.task.process({
        status,
        dependencyResults,
        statusOnly: this.statusOnly,
      })
      console.log("Processed task", this.task.isExecuteTask(), this.task.getKey())
      this.task.emit("processed", { result: processResult })
      if (processResult.state === "ready") {
        const msg = `${this.task.getDescription()} is ready.`
        this.statusOnly || this.task.type === "resolve-action" ? this.task.log.debug(msg) : this.task.log.verbose(msg)
      }
      return {
        ...processResult,
        // Use the cache info from the getStatus call
        cacheInfo: statusResult.cacheInfo,
        didRun: true,
      }
    } catch (error) {
      this.task.emit("processed", { error: toGardenError(error) })
      throw error
    }
  }
}

@Profile()
export class StatusTaskNode<T extends Task = Task> extends TaskNode<T> {
  readonly executionType: NodeType = "status"

  override get concurrencyLimit() {
    return this.task.statusConcurrencyLimit
  }

  /**
   * Tasks with different limits will be grouped in separate concurrency groups.
   *
   * E.g. if 50 build tasks have limit of 5, and 30 build tasks have limit of 10, then 15 build tasks will execute concurrently.
   */
  override get concurrencyGroupKey() {
    return `${this.executionType}-${this.task.type}-${this.task.executeConcurrencyLimit}`
  }

  describe() {
    return `resolving status for ${this.task.getDescription()}`
  }

  getDependencies() {
    const statusDeps = this.task.getStatusDependencies()
    // Note: We need to _process_ the status dependencies
    return statusDeps.map((task) => this.getNode("process", task))
  }

  async execute() {
    this.task.log.silly(() => `Executing node ${styles.underline(this.getKey())}`)
    const dependencyResults = this.getDependencyResults()

    try {
      const result: TaskResultType<T> = await this.task.getStatus({
        statusOnly: this.statusOnly,
        dependencyResults,
      })
      this.task.emit("statusResolved", { result })
      if (!this.task.force && result?.state === "ready") {
        const msg = `${this.task.getDescription()} status is ready.`
        this.statusOnly || this.task.type === "resolve-action" ? this.task.log.debug(msg) : this.task.log.verbose(msg)
      }
      return result
    } catch (error) {
      this.task.emit("statusResolved", { error: toGardenError(error) })
      throw error
    }
  }
}

export function getNodeKey(task: Task, type: NodeType) {
  return `${task.getKey()}:${type}`
}

export type CompleteHandler<R extends ValidResultType> = (result: GraphResult<R>) => void

export interface CompleteTaskParams {
  startedAt: Date | null
  error: Error | null
  result: ValidResultType | null
  aborted: boolean
  // Used to track the unique task keys that have been aborted when a dependency fails and we recursively cancel
  // its dependants (see `TaskNode#complete`). This helps us log each aborted key only once (since we may need to
  // cancel e.g. both a request node and a process node for the same key).
  abortedKeys?: Set<string>
}
export interface GraphNodeErrorParams {
  resultError: Error
  node: TaskNode
}

export class GraphNodeError extends GraphError {
  node: TaskNode

  constructor({ resultError, node }: GraphNodeErrorParams) {
    const message = `${node.describe()} failed: ${resultError}`
    const wrappedErrors = [toGardenError(resultError)]

    super({
      message,
      wrappedErrors,
      taskType: node.task.type,
    })

    this.node = node
  }
}
