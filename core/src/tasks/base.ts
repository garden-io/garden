/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { GraphResults } from "../task-graph"
import { v1 as uuidv1 } from "uuid"
import { Garden } from "../garden"
import { LogEntry } from "../logger/log-entry"
import { pickBy, mapValues, mapKeys } from "lodash"
import { ServiceStatus } from "../types/service"
import { splitLast } from "../util/util"
import { Profile } from "../util/profiling"
import { Action, actionKinds } from "../actions/base"

export type TaskType =
  | "build"
  | "delete-service"
  | "deploy"
  | "get-service-status"
  | "get-task-result"
  | "publish"
  | "resolve-module-config"
  | "resolve-module"
  | "resolve-provider"
  | "stage-build"
  | "start-sync"
  | "task"
  | "test"
  | "plugin"

export class TaskDefinitionError extends Error {}

export function makeBaseKey(type: TaskType, name: string) {
  return `${type}.${name}`
}

interface CommonTaskParams {
  garden: Garden
  log: LogEntry
  force?: boolean
}

export interface TaskParams extends CommonTaskParams {
  garden: Garden
  log: LogEntry
  force?: boolean
  version: string
}

export interface ActionTaskParams<T extends Action = Action> extends CommonTaskParams {
  action: T
}

@Profile()
export abstract class BaseTask {
  abstract type: TaskType

  // How many tasks of this exact type are allowed to run concurrently
  concurrencyLimit = 10

  garden: Garden
  log: LogEntry
  uid: string
  force: boolean
  version: string
  interactive = false

  _resolvedDependencies?: BaseTask[]

  constructor(initArgs: TaskParams) {
    this.garden = initArgs.garden
    this.uid = uuidv1() // uuidv1 is timestamp-based
    this.force = !!initArgs.force
    this.version = initArgs.version
    this.log = initArgs.log
  }

  abstract resolveDependencies(): Promise<BaseTask[]>

  /**
   * Wrapper around resolveDependencies() that memoizes the results.
   */
  async getDependencies(): Promise<BaseTask[]> {
    if (!this._resolvedDependencies) {
      this._resolvedDependencies = await this.resolveDependencies()
    }

    return this._resolvedDependencies
  }

  abstract getName(): string

  getKey(): string {
    return makeBaseKey(this.type, this.getName())
  }

  getId(): string {
    return `${this.getKey()}.${this.uid}`
  }

  abstract getDescription(): string

  abstract process(dependencyResults: GraphResults): Promise<any>
}

export abstract class BaseActionTask<T extends Action> extends BaseTask {
  action: T

  constructor(initArgs: ActionTaskParams<T>) {
    const { action } = initArgs
    super({ ...initArgs, version: action.versionString() })
    this.action = action
  }
}

export function getServiceStatuses(dependencyResults: GraphResults): { [name: string]: ServiceStatus } {
  const getServiceStatusResults = pickBy(dependencyResults, (r) => r && r.type === "get-service-status")
  const deployResults = pickBy(dependencyResults, (r) => r && r.type === "deploy")
  // DeployTask results take precedence over GetServiceStatusTask results, because status changes after deployment
  const combined = { ...getServiceStatusResults, ...deployResults }
  const statuses = mapValues(combined, (r) => r!.output as ServiceStatus)
  return mapKeys(statuses, (_, key) => splitLast(key, ".")[1])
}

export function getRunTaskResults(dependencyResults: GraphResults): { [name: string]: RunTaskResult } {
  const storedResults = pickBy(dependencyResults, (r) => r && r.type === "get-task-result")
  const runResults = pickBy(dependencyResults, (r) => r && r.type === "task")
  // TaskTask results take precedence over GetTaskResultTask results
  const combined = { ...storedResults, ...runResults }
  const results = mapValues(combined, (r) => r!.output as RunTaskResult)
  return mapKeys(results, (_, key) => splitLast(key, ".")[1])
}
