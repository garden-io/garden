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
import { Action, Resolved } from "../actions/base"
import { ConfigGraph } from "../graph/config-graph"
import { isBuildAction } from "../actions/build"
import { BuildTask } from "./build"
import { isDeployAction } from "../actions/deploy"
import { DeployTask } from "./deploy"
import { isRunAction } from "../actions/run"
import { RunTask } from "./task"
import { InternalError } from "../exceptions"
import { TestTask } from "./test"
import { isTestAction } from "../actions/test"
import { ActionReference } from "../config/common"

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
  | "start-sync"
  | "run"
  | "test"
  | "plugin"

export class TaskDefinitionError extends Error {}

export function makeBaseKey(type: TaskType, name: string) {
  return `${type}.${name}`
}

interface CommonTaskParams {
  garden: Garden
  log: LogEntry
  force: boolean
  fromWatch: boolean
  skipDependencies?: boolean
}

export interface BaseTaskParams extends CommonTaskParams {
  version: string
}

export interface BaseActionTaskParams<T extends Action = Action> extends CommonTaskParams {
  action: T
  graph: ConfigGraph
  devModeDeployNames: string[]
  localModeDeployNames: string[]
  forceActions?: ActionReference[]
  forceBuild?: boolean // Shorthand for placing all builds in forceActions
}

export interface TaskProcessParams {
  dependencyResults: GraphResults
}

@Profile()
export abstract class BaseTask<T extends Action = any, O = T["_outputs"]> {
  abstract type: TaskType

  // How many tasks of this exact type are allowed to run concurrently
  concurrencyLimit = 10

  public readonly garden: Garden
  public readonly log: LogEntry
  public readonly uid: string
  public readonly force: boolean
  public readonly version: string
  public readonly fromWatch: boolean
  public readonly skipDependencies: boolean
  interactive = false

  _resultType: O
  _resolvedDependencies?: BaseTask[]

  constructor(initArgs: BaseTaskParams) {
    this.garden = initArgs.garden
    this.uid = uuidv1() // uuidv1 is timestamp-based
    this.force = !!initArgs.force
    this.version = initArgs.version
    this.log = initArgs.log
    this.skipDependencies = !!initArgs.skipDependencies
  }

  abstract getName(): string
  abstract resolveDependencies(): BaseTask[]
  abstract getDescription(): string
  abstract getStatus(params: TaskProcessParams): Promise<O | null>
  abstract process(params: TaskProcessParams): Promise<O>

  /**
   * Wrapper around resolveDependencies() that memoizes the results and applies generic filters.
   */
  getDependencies(): BaseTask[] {
    if (!this._resolvedDependencies) {
      if (this.skipDependencies) {
        return []
      } else {
        this._resolvedDependencies = this.resolveDependencies()
      }
    }

    return this._resolvedDependencies
  }

  getKey(): string {
    return makeBaseKey(this.type, this.getName())
  }

  getId(): string {
    return `${this.getKey()}.${this.uid}`
  }
}

export interface ActionTaskProcessParams<T extends Action = any> extends TaskProcessParams {
  resolvedAction: Resolved<T>
}

export abstract class BaseActionTask<T extends Action, O = T["_outputs"]> extends BaseTask<T, O> {
  action: T
  graph: ConfigGraph
  devModeDeployNames: string[]
  localModeDeployNames: string[]
  forceActions: ActionReference[]

  constructor(params: BaseActionTaskParams<T>) {
    const { action } = params
    super({ ...params, version: action.versionString() })
    this.action = action
    this.graph = params.graph
    this.devModeDeployNames = params.devModeDeployNames
    this.localModeDeployNames = params.localModeDeployNames
    this.forceActions = params.forceActions || []

    if (params.forceBuild) {
      this.forceActions.push(...this.graph.getBuilds())
    }
  }

  abstract getStatus(params: ActionTaskProcessParams<T>): Promise<O | null>
  abstract process(params: ActionTaskProcessParams<T>): Promise<O>

  getName() {
    return this.action.name
  }

  // Most tasks can just use this default method.
  resolveDependencies(): BaseTask[] {
    return this.action.getDependencyReferences().map((dep) => {
      const action = this.graph.getActionByRef(dep)
      return this.getResolveTaskForDependency(action)
    })
  }

  // Helpers //

  protected getBaseDependencyParams() {
    return {
      garden: this.garden,
      log: this.log,
      graph: this.graph,
      fromWatch: this.fromWatch,
      devModeDeployNames: this.devModeDeployNames,
      localModeDeployNames: this.localModeDeployNames,
      forceActions: this.forceActions,
    }
  }

  /**
   * Returns a primary Task for the given Action, e.g. DeployTask for Deploy, BuildTask for Build etc.
   *
   * Note that this is not always the correct Task to perform, e.g. for the DeleteDeployTask. This is generally
   * the Task that is necessary to _resolve_ an action.
   */
  getResolveTaskForDependency(action: Action) {
    const params = {
      ...this.getBaseDependencyParams(),
      force: !!this.forceActions.find((r) => r.kind === action.kind && r.name === action.name),
    }

    if (isBuildAction(action)) {
      return new BuildTask({ ...params, action })
    } else if (isDeployAction(action)) {
      return new DeployTask({ ...params, action })
    } else if (isRunAction(action)) {
      return new RunTask({ ...params, action })
    } else if (isTestAction(action)) {
      return new TestTask({ ...params, action })
    } else {
      // Shouldn't happen
      throw new InternalError(`Unexpected action kind ${action.kind}`, { config: action.getConfig() })
    }
  }
}

// TODO-G2
export function getServiceStatuses(dependencyResults: GraphResults): { [name: string]: ServiceStatus } {
  const getServiceStatusResults = pickBy(dependencyResults, (r) => r && r.type === "get-service-status")
  const deployResults = pickBy(dependencyResults, (r) => r && r.type === "deploy")
  // DeployTask results take precedence over GetServiceStatusTask results, because status changes after deployment
  const combined = { ...getServiceStatusResults, ...deployResults }
  const statuses = mapValues(combined, (r) => r!.result as ServiceStatus)
  return mapKeys(statuses, (_, key) => splitLast(key, ".")[1])
}

export function getRunTaskResults(dependencyResults: GraphResults): { [name: string]: RunTaskResult } {
  const storedResults = pickBy(dependencyResults, (r) => r && r.type === "get-task-result")
  const runResults = pickBy(dependencyResults, (r) => r && r.type === "task")
  // TaskTask results take precedence over GetTaskResultTask results
  const combined = { ...storedResults, ...runResults }
  const results = mapValues(combined, (r) => r!.result as RunTaskResult)
  return mapKeys(results, (_, key) => splitLast(key, ".")[1])
}
