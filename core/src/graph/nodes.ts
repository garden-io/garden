/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Task, ValidResultType } from "../tasks/base"
import { GardenBaseError, InternalError } from "../exceptions"
import { GraphResult, GraphResults } from "./results"
import { ActionStatus } from "../actions/types"
import type { GraphSolver } from "./solver"
import { ValuesType } from "utility-types"
import chalk from "chalk"

export interface InternalNodeTypes {
  status: StatusTaskNode
  process: ProcessTaskNode
}

export type InternalNode = ValuesType<InternalNodeTypes>

export interface NodeTypes extends InternalNodeTypes {
  request: RequestTaskNode
}

export type NodeType = keyof NodeTypes

export interface TaskNodeParams<T extends Task> {
  solver: GraphSolver
  task: T
  dependant?: TaskNode
}

export abstract class TaskNode<T extends Task = Task> {
  abstract readonly executionType: NodeType

  public readonly type: string
  public startedAt?: Date
  public readonly task: T

  protected solver: GraphSolver
  protected dependants: { [key: string]: TaskNode }
  protected result?: GraphResult<any>

  constructor({ solver, task }: TaskNodeParams<T>) {
    this.task = task
    this.type = task.type
    this.solver = solver
    this.dependants = {}
  }

  abstract describe(): string
  abstract getDependencies(): TaskNode[]
  abstract execute(): Promise<T["_resultType"] | null>

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
  getDependencyResult<A extends Task>(node: TaskNode<A>): GraphResult<A["_resultType"]> | undefined {
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
  complete({ startedAt, error, result, aborted }: CompleteTaskParams<T["_resultType"]>): GraphResult<any> {
    if (this.result) {
      return this.result
    }

    const task = this.task

    task.log.silly(
      `Completing node ${chalk.underline(this.getKey())}. aborted=${aborted}, error=${error ? error.message : null}`
    )

    this.result = {
      type: task.type,
      description: task.getDescription(),
      key: task.getKey(),
      name: task.getName(),
      result,
      dependencyResults: this.getDependencyResults().getMap(),
      aborted,
      startedAt,
      completedAt: new Date(),
      error,
      version: this.task.version,
      outputs: result?.outputs,
      task,
      processed: this.executionType === "process",
    }

    if (aborted || error) {
      // Fail every dependant
      for (const d of Object.values(this.dependants)) {
        d.complete({
          startedAt,
          aborted: true,
          result: null,
          // Note: The error message is constructed in the error constructor
          error: new GraphNodeError({ ...this.result, aborted: true, node: d }),
        })
      }
    }

    return this.result
  }

  /**
   * Returns the task result if the task is completed. Returns undefined if result is not available.
   */
  getResult() {
    return this.result
  }

  protected getNode<NT extends keyof InternalNodeTypes>(type: NT, task: Task): InternalNodeTypes[NT] {
    return this.solver.getNode(type, task)
  }
}

export interface TaskRequestParams<T extends Task = Task> extends TaskNodeParams<T> {
  batchId: string
  statusOnly: boolean
  completeHandler: CompleteHandler<T["_resultType"]>
}

export class RequestTaskNode<T extends Task = Task> extends TaskNode<T> {
  // FIXME: this is a bit of a TS oddity, but it does work...
  executionType = <NodeType>"request"

  public readonly requestedAt: Date
  public readonly batchId: string
  public readonly statusOnly: boolean

  private completeHandler: CompleteHandler<T["_resultType"]>

  constructor(params: TaskRequestParams<T>) {
    super(params)
    this.requestedAt = new Date()
    this.batchId = params.batchId
    this.statusOnly = params.statusOnly
    this.completeHandler = params.completeHandler
  }

  describe() {
    return this.task.getDescription()
  }

  getKey() {
    return `${this.task.getBaseKey()}:request:${this.batchId}`
  }

  getDependencies(): TaskNode[] {
    if (this.statusOnly) {
      return [this.getNode("status", this.task)]
    } else {
      return [this.getNode("process", this.task)]
    }
  }

  complete(params: CompleteTaskParams<T["_resultType"]>) {
    const result = super.complete(params)
    this.completeHandler(result)
    return result
  }

  // NOT USED
  async execute() {
    return undefined
  }
}

export class ProcessTaskNode<T extends Task = Task> extends TaskNode<T> {
  executionType = <NodeType>"process"

  describe() {
    return `process ${this.task.getDescription()}`
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
    this.task.log.silly(`Executing node ${chalk.underline(this.getKey())}`)

    const statusTask = this.getNode("status", this.task)
    const result = this.getDependencyResult(statusTask)
    const status = result === undefined ? undefined : <ActionStatus>result.result

    if (status === undefined) {
      throw new InternalError(`Attempted to execute ${this.describe()} before resolving status.`, {
        nodeKey: this.getKey(),
      })
    }

    const dependencyResults = this.getDependencyResults()

    return this.task.process({ status, dependencyResults })
  }
}

export class StatusTaskNode<T extends Task = Task> extends TaskNode<T> {
  executionType = <NodeType>"status"

  describe() {
    return `resolve status for ${this.task.getDescription()}`
  }

  getDependencies() {
    const statusDeps = this.task.getStatusDependencies()
    // Note: We need to _process_ the status dependencies
    return statusDeps.map((task) => this.getNode("process", task))
  }

  async execute() {
    this.task.log.silly(`Executing node ${chalk.underline(this.getKey())}`)
    const dependencyResults = this.getDependencyResults()
    return this.task.getStatus({ dependencyResults })
  }
}

export function getNodeKey(task: Task, type: NodeType) {
  return `${task.getKey()}:${type}`
}

export type CompleteHandler<R extends ValidResultType> = (result: GraphResult<R>) => void

export interface CompleteTaskParams<R = any> {
  startedAt: Date | null
  error: Error | null
  result: R | null
  aborted: boolean
}

export interface GraphNodeErrorDetail extends GraphResult {
  node: TaskNode
  failedDependency?: TaskNode
}

export interface GraphNodeErrorParams extends GraphNodeErrorDetail {}

export class GraphNodeError extends GardenBaseError<GraphNodeErrorDetail> {
  type = "graph"

  constructor(params: GraphNodeErrorParams) {
    const { node, failedDependency, error } = params

    let message = ""

    if (failedDependency) {
      message = `${node.describe()} aborted because a dependency could not be completed:`

      let nextDep: TaskNode | null = failedDependency

      while (nextDep) {
        const result = nextDep.getResult()

        if (!result) {
          nextDep = null
        } else if (result?.aborted) {
          message += chalk.yellow(`\n↳ ${nextDep.describe()} [ABORTED]`)
          if (result.error instanceof GraphNodeError && result.error.detail.failedDependency) {
            nextDep = result.error.detail.failedDependency
          } else {
            nextDep = null
          }
        } else if (result?.error) {
          message += chalk.red.bold(`\n↳ ${nextDep.describe()} [FAILED] - ${result.error.message}`)
          nextDep = null
        }
      }
    } else {
      message = `${node.describe()} failed: ${error}`
    }

    super(message, params)
  }

  aborted() {
    return this.detail.aborted
  }
}
