/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { GraphResults } from "../graph/solver"
import { v1 as uuidv1 } from "uuid"
import { Garden } from "../garden"
import { LogEntry } from "../logger/log-entry"
import { pickBy, mapValues, mapKeys } from "lodash"
import { splitLast } from "../util/util"
import { Profile } from "../util/profiling"
import { Action, Executed, Resolved } from "../actions/base"
import { ConfigGraph } from "../graph/config-graph"
import { ActionReference } from "../config/common"
import { DeployStatus } from "../plugin/handlers/deploy/get-status"
import { GetRunResult } from "../plugin/handlers/run/get-result"
import { getExecuteTaskForAction } from "../graph/actions"
import { ResolveActionTask } from "./resolve-action"
import { InternalError } from "../exceptions"

export class TaskDefinitionError extends Error {}

export function makeBaseKey(type: string, name: string) {
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

export interface ValidResultType {
  outputs: {}
}

@Profile()
export abstract class BaseTask<O extends ValidResultType = ValidResultType, S extends ValidResultType = O> {
  abstract type: string

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
  _statusType: S
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
  abstract getStatus(params: TaskProcessParams): Promise<S | null>
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

export interface ActionTaskStatusParams<_ extends Action> extends TaskProcessParams {}
export interface ActionTaskProcessParams<T extends Action, S extends ValidResultType>
  extends ActionTaskStatusParams<T> {
  status: S
}

export abstract class BaseActionTask<
  T extends Action,
  O extends ValidResultType = { outputs: T["_outputs"] },
  S extends ValidResultType = O
> extends BaseTask<O, S> {
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

  abstract getStatus(params: ActionTaskStatusParams<T>): Promise<S | null>
  abstract process(params: ActionTaskProcessParams<T, S>): Promise<O>

  getName() {
    return this.action.name
  }

  // Most tasks can just use this default method.
  // TODO-G2: review this for all task types
  resolveDependencies(): BaseTask[] {
    const resolveTask = this.getResolveTask(this.action)

    const depTasks = this.action.getDependencyReferences().map((dep) => {
      const action = this.graph.getActionByRef(dep)

      if (dep.type === "implicit") {
        return this.getResolveTask(action)
      } else {
        return this.getExecuteTask(action)
      }
    })

    return [...depTasks, resolveTask]
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
   * Given a set of graph results, return a resolved version of the action.
   * Throws if the dependency results don't contain the required task results.
   */
  getResolvedAction(dependencyResults: GraphResults): Resolved<T> {
    const resolveTask = this.getResolveTask(this.action)
    const result = getResultForTask(resolveTask, dependencyResults)

    if (!result) {
      throw new InternalError(
        `Could not find resolved action '${this.action.key()}' when processing task '${this.getKey()}'. This is a bug, please report it!`,
        { taskType: this.type, action: this.action.key() }
      )
    }

    return <Resolved<T>>result.outputs.resolvedAction
  }

  /**
   * Given a set of graph results, return an executed version of the action.
   * Throws if the dependency results don't contain the required task results.
   */
  getExecutedAction(dependencyResults: GraphResults): Executed<T> {
    const resolveTask = this.getExecuteTask(this.action)
    const result = getResultForTask(resolveTask, dependencyResults)

    if (!result) {
      throw new InternalError(
        `Could not find executed action '${this.action.key()}' when processing task '${this.getKey()}'. This is a bug, please report it!`,
        { taskType: this.type, action: this.action.key() }
      )
    }

    return <Executed<T>>result.outputs.resolvedAction
  }

  /**
   * Returns the ResolveActionTask for the given Action.
   */
  protected getResolveTask(action: Action) {
    const force = !!this.forceActions.find((r) => r.kind === action.kind && r.name === action.name)
    return new ResolveActionTask({ ...this.getBaseDependencyParams(), force, action })
  }

  /**
   * Returns the execution Task for the given Action, e.g. DeployTask for Deploy, BuildTask for Build etc.
   *
   * Note that this is not always the correct Task to perform when processing deps, e.g. for the DeleteDeployTask.
   */
  protected getExecuteTask(action: Action) {
    const force = !!this.forceActions.find((r) => r.kind === action.kind && r.name === action.name)
    return getExecuteTaskForAction(action, { ...this.getBaseDependencyParams(), force })
  }
}

export abstract class ExecuteActionTask<
  T extends Action,
  O extends ValidResultType = { outputs: T["_outputs"] },
  S extends ValidResultType = O
> extends BaseActionTask<T, O, S> {
  abstract getStatus(params: ActionTaskStatusParams<T>): Promise<(S & { executedAction: Executed<T> }) | null>
  abstract process(params: ActionTaskProcessParams<T, S>): Promise<O & { executedAction: Executed<T> }>
}

export function getResultForTask<T extends BaseTask>(task: T, graphResults: GraphResults): T["_resultType"] | null {
  return graphResults[task.getKey()]
}

export function getServiceStatuses(dependencyResults: GraphResults): { [name: string]: DeployStatus } {
  const deployResults = pickBy(dependencyResults, (r) => r && r.type === "deploy")
  const statuses = mapValues(deployResults, (r) => r!.result as DeployStatus)
  return mapKeys(statuses, (_, key) => splitLast(key, ".")[1])
}

export function getRunResults(dependencyResults: GraphResults): { [name: string]: GetRunResult } {
  const runResults = pickBy(dependencyResults, (r) => r && r.type === "run")
  const results = mapValues(runResults, (r) => r!.result as GetRunResult)
  return mapKeys(results, (_, key) => splitLast(key, ".")[1])
}
