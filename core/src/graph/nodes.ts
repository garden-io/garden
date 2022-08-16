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
import { ActionStatus } from "../actions/base"

export type NodeType = "request" | "status" | "process"

export interface TaskNodeParams<T extends Task> {
  task: T
  dependant?: TaskNode
}

export abstract class TaskNode<N extends NodeType = NodeType, T extends Task = Task> {
  abstract readonly executionType: N

  public readonly type: string
  public startedAt?: Date
  public readonly task: T

  protected dependants: { [key: string]: TaskNode }
  protected dependencyResults: { [key: string]: GraphResult<any> }
  protected result?: GraphResult<any>

  constructor({ task }: TaskNodeParams<T>) {
    this.task = task
    this.type = task.type
    this.dependants = {}
  }

  abstract describe(): string
  abstract getDependencies(): TaskNode[]
  abstract execute(): Promise<T["_resultType"] | null>

  getKey() {
    return `${this.task.getKey()}:${this.executionType}`
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
  getDependencyResult<A extends NodeType, B extends Task>(
    node: TaskNode<A, B>
  ): GraphResult<B["_resultType"]> | undefined {
    const key = node.getKey()
    return this.dependencyResults[key]
  }

  setDependencyResult(result: GraphResult) {
    this.dependencyResults[result.key] = result
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

  /**
   * Completes the node, setting its result and propagating it to each dependant node.
   *
   * If the node is aborted or an error is set, dependants are aborted.
   *
   * If the node was already completed, this is a no-op (may e.g. happen if the node has been completed
   * but a dependency fails and is aborting dependants).
   */
  complete({ error, result, aborted }: CompleteTaskParams<T["_resultType"]>): GraphResult<any> {
    if (this.result) {
      return this.result
    }

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

    for (const d of Object.values(this.dependants)) {
      d.setDependencyResult(this.result)

      if (aborted || error) {
        const failureDescription = aborted ? "was aborted" : "failed"
        d.complete({
          aborted,
          result: null,
          error: new GraphNodeError(
            `Aborted ${d.describe()} because dependency (${this.describe()}) ${failureDescription}.`,
            this.result
          ),
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
}

export interface TaskRequestParams<T extends Task = Task> extends TaskNodeParams<T> {
  batchId: string
  statusOnly: boolean
  completeHandler: CompleteHandler<T["_resultType"]>
}

export class RequestTaskNode<T extends Task = Task> extends TaskNode<"request", T> {
  executionType: "request" = "request"

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

  getDependencies(): TaskNode<NodeType, T>[] {
    const params = { task: this.task }

    if (this.statusOnly) {
      return [new StatusTaskNode(params)]
    } else {
      return [new ProcessTaskNode(params)]
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

export class ProcessTaskNode<T extends Task = Task> extends TaskNode<"process", T> {
  executionType: "process" = "process"

  describe() {
    return this.task.getDescription()
  }

  getDependencies() {
    if (!this.task.force) {
      // Not forcing execution, so we first resolve the status
      const statusTask = new StatusTaskNode({ task: this.task })
      const statusResult = this.getDependencyResult(statusTask)

      if (statusResult === undefined) {
        // Status is still missing
        return [statusTask]
      } else if (statusResult.result?.state === "ready") {
        // No dependencies needed if status is ready and not forcing
        return []
      }
    }

    // Either forcing, or status is not ready
    const processDeps = this.task.getProcessDependencies()
    return processDeps.map((task) => new ProcessTaskNode({ task }))
  }

  getStatus(): ActionStatus | undefined {
    const statusTask = new StatusTaskNode({ task: this.task })
    const result = this.getDependencyResult(statusTask)
    return result === undefined ? undefined : <ActionStatus>result.result
  }

  async execute() {
    const status = this.getStatus()

    if (status === undefined) {
      throw new InternalError(`Attempted to execute ${this.describe()} before resolving status.`, {
        nodeKey: this.getKey(),
      })
    }

    return this.task.process({ status, dependencyResults: this.getDependencyResults() })
  }
}

export class StatusTaskNode<T extends Task = Task> extends TaskNode<"status", T> {
  executionType: "status" = "status"

  describe() {
    return `status for ${this.task.getDescription()}`
  }

  getDependencies() {
    const statusDeps = this.task.getStatusDependencies()
    return statusDeps.map((task) => new StatusTaskNode({ task }))
  }

  async execute() {
    return this.task.getStatus({ dependencyResults: this.getDependencyResults() })
  }
}

export type CompleteHandler<R extends ValidResultType> = (result: GraphResult<R>) => void

export interface CompleteTaskParams<R = any> {
  error: Error | null
  result: R | null
  aborted: boolean
}

export interface GraphNodeErrorDetail extends GraphResult {}

export class GraphNodeError extends GardenBaseError<GraphNodeErrorDetail> {
  type = "graph"
}
