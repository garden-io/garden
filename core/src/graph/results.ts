/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { BaseTask, Task, TaskResultType, ValidResultType } from "../tasks/base.js"
import { fromPairs, omit, pick } from "lodash-es"
import { toGraphResultEventPayload } from "../events/events.js"
import { stringify } from "flatted"
import type { GardenError } from "../exceptions.js"
import { InternalError, toGardenError } from "../exceptions.js"

export interface TaskEventBase {
  type: string
  description: string
  key: string
  name: string
  // The input version is only null if an error occurred when calculating it (e.g. the action referenced a missing
  // dependency).
  inputVersion: string | null
}

export interface GraphResult<R extends ValidResultType = ValidResultType> extends TaskEventBase {
  result: R | null
  dependencyResults: GraphResultMapWithoutTask | null
  startedAt: Date | null
  completedAt: Date | null
  error: Error | null
  aborted: boolean
  outputs: R["outputs"]
  task: BaseTask
  processed: boolean
  success: boolean
  // Set to true if the action indicates that it's persistently running after task execution
  // and attached to the Garden process. Not necessary for e.g. normal deployments that keep
  // running but outside of the Garden process.
  attached: boolean
}

export type GraphResultWithoutTask<T extends Task = Task> = Omit<GraphResultFromTask<T>, "task">

export type GraphResultFromTask<T extends Task> = GraphResult<TaskResultType<T>>

export interface GraphResultMap<T extends Task = Task> {
  [key: string]: GraphResultFromTask<T> | null
}

export interface GraphResultMapWithoutTask<T extends Task = Task> {
  [key: string]: GraphResultWithoutTask<T> | null
}

export class GraphResults<TaskType extends Task = Task> {
  private results: Map<string, GraphResultFromTask<TaskType> | null>
  private tasks: Map<string, TaskType>

  constructor(tasks: TaskType[]) {
    this.results = new Map(tasks.map((t) => [t.getBaseKey(), null]))
    this.tasks = new Map(tasks.map((t) => [t.getBaseKey(), t]))
  }

  setResult<T extends TaskType>(task: T, result: GraphResultFromTask<T>) {
    const key = task.getBaseKey()
    this.checkKey(key)
    this.results.set(key, result)
  }

  getResult<T extends TaskType>(task: T): GraphResultFromTask<T> | null {
    const key = task.getBaseKey()
    this.checkKey(key)
    return this.results.get(key) || null
  }

  /**
   * Get results for all tasks with the same type as the given `task`.
   */
  getResultsByType<T extends TaskType>(task: T): (GraphResultFromTask<T> | null)[] {
    return this.getTasks()
      .filter((t): t is TaskType => t.type === task.type)
      .map((t) => this.getResult(t))
  }

  getTasks(): Task[] {
    return Array.from(this.tasks.values())
  }

  getMissing(): Task[] {
    return this.getTasks().filter((t) => this.getResult(t as TaskType) === null)
  }

  getAll(): (GraphResult | null)[] {
    return Array.from(this.results.values())
  }

  getMap(): GraphResultMap {
    return fromPairs(Array.from(this.results.entries()))
  }

  filterForGraphResult<T extends Task = Task>(): GraphResultMapWithoutTask<T> {
    return mapResults(this.results, (v) => (v ? { ...omit(v, "task") } : null))
  }

  /**
   * Export the result object in a format that's suitable for JSON, command outputs etc.
   */
  export(): GraphResultMapWithoutTask {
    return mapResults(this.results, (v) => prepareForExport(v))
  }

  private checkKey(key: string) {
    if (!this.tasks.has(key)) {
      const taskKeys = Array.from(this.tasks.keys())
      throw new InternalError({
        message: `GraphResults object does not have task ${key}. Available keys: [${taskKeys.join(", ")}]`,
      })
    }
  }
}

/**
 * Convenience helper for mapping the values of a Map or plain object of graph results (note: Returns a plain object,not a Map).
 */
function mapResults<T extends Task = Task, R extends object = {}>(
  results: Map<string, GraphResultWithoutTask<T> | null> | GraphResultMapWithoutTask<T> | null,
  fn: (val: GraphResultWithoutTask<T> | null) => R | null
): { [key: string]: R | null } {
  if (!results) {
    return {}
  }
  const entries = results instanceof Map ? results.entries() : Object.entries(results)
  return fromPairs(Array.from(entries).map(([k, v]) => [k, fn(v)]))
}

/**
 * Render a result to string. Used for debugging and errors.
 */
export function resultToString(result: GraphResult) {
  // TODO: improve
  return stringify(toGraphResultEventPayload(result))
}

/**
 * Prepares an individual GraphResult for export.
 */
function prepareForExport(graphResult: GraphResultWithoutTask | null) {
  if (!graphResult) {
    return null
  }
  const { result, error, dependencyResults } = graphResult
  const filteredDependencyResults = mapResults(dependencyResults || {}, prepareForExport)
  // We have to omit instead of picking here, since we may have action-keyed output values in here.
  return {
    ...pick(
      graphResult,
      "type",
      "description",
      "key",
      "name",
      "aborted",
      "startedAt",
      "completedAt",
      "version",
      "processed",
      "success",
      "inputVersion"
    ),
    result: filterResultForExport(result),
    error: filterErrorForExport(error),
    outputs: filterOutputsForExport(graphResult.outputs),
    dependencyResults: filteredDependencyResults,
  }
}

function filterResultForExport(result: any) {
  if (!result) {
    return null
  }
  // Here, we pick a list of safe (bounded-size) keys across the result types for `BuildTask`, `DeployTask`, `TestTask`
  // and `RunTask`.
  const filteredDetail = pick(
    result.detail || {},
    // Leaving these in because many of our command unit tests rely on them
    "fresh",
    "buildLog",
    "log",
    "message"
  )
  return {
    ...pick(
      result,

      // from DeployStatus
      "createdAt",
      "mode",
      "syncMode",
      "externalId",
      "externalVersion",
      "forwardablePorts",
      "ingresses",
      "lastMessage",
      "lastError",
      "outputs",
      "runningReplicas",
      "state",
      "updatedAt",
      "version",

      // from BuildStatus
      "fetched",
      "fresh",

      // from RunResult and TestResult
      "success",
      "exitCode",
      "startedAt",
      "completedAt"
    ),
    detail: filteredDetail,
  }
}

function filterOutputsForExport(outputs: any) {
  return omit(outputs, "resolvedAction", "executedAction")
}

function filterErrorForExport(error: any): GardenError | null {
  if (!error) {
    return null
  }

  // it's ok to return the original error. The toJSON method controls export of additional details (none by default)
  return toGardenError(error)
}
