/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { GraphResults } from "../graph/results.js"
import { v1 as uuidv1 } from "uuid"
import type { Garden } from "../garden.js"
import type { ActionLog, Log } from "../logger/log-entry.js"
import { createActionLog } from "../logger/log-entry.js"
import { Profile } from "../util/profiling.js"
import { type Action, type ActionState, type Executed, type Resolved } from "../actions/types.js"
import type { ConfigGraph } from "../graph/config-graph.js"
import type { ActionReference } from "../config/common.js"
import { GraphError, InternalError, RuntimeError } from "../exceptions.js"
import type { DeleteDeployTask } from "./delete-deploy.js"
import type { BuildTask } from "./build.js"
import type { DeployTask } from "./deploy.js"
import type { PluginActionTask, PluginTask } from "./plugin.js"
import type { PublishTask } from "./publish.js"
import type { ResolveActionTask } from "./resolve-action.js"
import type { ResolveProviderTask } from "./resolve-provider.js"
import type { RunTask } from "./run.js"
import type { TestTask } from "./test.js"
import { Memoize } from "typescript-memoize"
import { TypedEventEmitter } from "../util/events.js"
import type { Events, ActionStatusEventName } from "../events/events.js"
import {
  makeActionFailedPayload,
  makeActionCompletePayload,
  makeActionProcessingPayload,
  makeActionGetStatusPayload,
} from "../events/util.js"
import { styles } from "../logger/styles.js"
import type { ActionRuntime } from "../plugin/base.js"
import { deline } from "../util/string.js"
import { renderMessageWithDivider } from "../logger/util.js"

export function makeBaseKey(type: string, name: string) {
  return `${type}.${name}`
}

export interface CommonTaskParams {
  garden: Garden
  log: Log
  force: boolean
  skipDependencies?: boolean
}

export interface BaseActionTaskParams<T extends Action = Action> extends CommonTaskParams {
  log: Log
  action: T
  graph: ConfigGraph
  forceActions?: ActionReference[]
  forceBuild?: boolean // Shorthand for placing all builds in forceActions
  skipRuntimeDependencies?: boolean
}

export interface TaskProcessParams {
  statusOnly: boolean
  dependencyResults: GraphResults
}

export interface ValidResultType {
  state: ActionState
  outputs: {}
  attached?: boolean
}

export interface ValidExecutionActionResultType extends ValidResultType {
  detail: any | null
}

export type Task =
  | BuildTask
  | DeleteDeployTask
  | DeployTask
  | PluginTask
  | PluginActionTask<any, any>
  | PublishTask
  | ResolveActionTask<any>
  | ResolveProviderTask
  | RunTask
  | TestTask

export type ExecuteTask = BuildTask | DeployTask | RunTask | TestTask

export interface ResolveProcessDependenciesParams<S extends ValidResultType> {
  status: S | null
}

export interface BaseTaskOutputs {
  version: string
}

interface TaskEventPayload<O extends ValidResultType> {
  error?: Error
  result?: O
}

interface TaskEvents<O extends ValidResultType> {
  statusResolved: TaskEventPayload<O>
  processed: TaskEventPayload<O>
  ready: { result: O }
}

@Profile()
export abstract class BaseTask<O extends ValidResultType = ValidResultType> extends TypedEventEmitter<TaskEvents<O>> {
  abstract readonly type: string

  /**
   * How many execute task nodes of this exact type are allowed to run concurrently
   *
   * Children can override this to set a custom concurrency limit.
   */
  abstract readonly executeConcurrencyLimit: number

  /**
   * How many get-status task nodes of this exact type are allowed to run concurrently
   *
   * Children can override this to set a custom concurrency limit.
   */
  abstract readonly statusConcurrencyLimit: number

  public readonly garden: Garden
  public readonly log: Log
  public readonly uid: string
  public readonly force: boolean
  public readonly skipDependencies: boolean
  protected readonly executeTask: boolean = false
  interactive = false

  constructor(initArgs: CommonTaskParams) {
    super()
    this.garden = initArgs.garden
    this.uid = uuidv1() // uuidv1 is timestamp-based
    this.force = !!initArgs.force
    this.log = initArgs.log
    this.skipDependencies = !!initArgs.skipDependencies
  }

  abstract getName(): string

  // Which dependencies must be resolved to call this task's getStatus method
  abstract resolveStatusDependencies(): BaseTask[]

  // Which dependencies must be resolved to call this task's process method, in addition to the above
  abstract resolveProcessDependencies(params: ResolveProcessDependenciesParams<O>): BaseTask[]

  abstract getDescription(): string

  abstract getStatus(params: TaskProcessParams): null | Promise<O | null>

  abstract process(params: TaskProcessParams): Promise<O>

  /**
   * The "input version" of a task generally refers to the version of the task's inputs, before
   * any resolution or execution happens. For action tasks, this will generally be the unresolved
   * version.
   *
   * The corresponding "output version" is what's returned by the `getStatus` and `process` handlers.
   */
  abstract getInputVersion(): string

  /**
   * Wrapper around resolveStatusDependencies() that memoizes the results.
   */
  @Memoize()
  getStatusDependencies(): BaseTask[] {
    return this.resolveStatusDependencies()
  }

  /**
   * Wrapper around resolveProcessDependencies() that memoizes the results and applies filters.
   */
  @Memoize((params: ResolveProcessDependenciesParams<O>) => (params.status ? params.status.state : null))
  getProcessDependencies(params: ResolveProcessDependenciesParams<O>): BaseTask[] {
    if (this.skipDependencies) {
      return []
    }
    return this.resolveProcessDependencies(params)
  }

  /**
   * The basic type and name of the task.
   */
  getBaseKey(): string {
    return makeBaseKey(this.type, this.getName())
  }

  /**
   * A key that factors in different parameters, e.g. sync mode for deploys, force flags, versioning etc.
   * Used to handle overlapping graph solve requests.
   */
  getKey(): string {
    // TODO-0.13.1
    const key = this.getBaseKey()

    // if (this.force) {
    //   key += ".force=true"
    // }

    return key
  }

  /**
   * A completely unique key for the instance of the task.
   */
  getId(): string {
    return `${this.getBaseKey()}.${this.uid}`
  }

  isExecuteTask(): this is ExecuteTask {
    return this.executeTask
  }

  toSanitizedValue() {
    return `<Task: ${this.getDescription()}>`
  }
}

export type ActionTaskStatusParams<_ extends Action> = TaskProcessParams

export interface ActionTaskProcessParams<T extends Action, S extends ValidResultType>
  extends ActionTaskStatusParams<T> {
  status: S | null
}

export abstract class BaseActionTask<T extends Action, O extends ValidResultType> extends BaseTask<O> {
  action: T
  graph: ConfigGraph
  forceActions: ActionReference[]
  skipRuntimeDependencies: boolean
  override log: ActionLog

  constructor(params: BaseActionTaskParams<T>) {
    const { action } = params

    super({ ...params })
    this.log = createActionLog({ log: params.log, action })
    this.action = action
    this.graph = params.graph
    this.forceActions = params.forceActions || []
    this.skipRuntimeDependencies = params.skipRuntimeDependencies || false

    if (params.forceBuild) {
      this.forceActions.push(...this.graph.getBuilds())
    }
  }

  abstract override getStatus(params: ActionTaskStatusParams<T>): null | Promise<O | null>

  abstract override process(params: ActionTaskProcessParams<T, O>): Promise<O>

  getName() {
    return this.action.name
  }

  getInputVersion(): string {
    return this.action.versionString(this.log)
  }

  // Most tasks can just use these default methods.
  resolveStatusDependencies(): BaseTask[] {
    return [this.getResolveTask(this.action)]
  }

  resolveProcessDependencies({ status }: ResolveProcessDependenciesParams<ValidResultType>): BaseTask[] {
    const resolveTask = this.getResolveTask(this.action)

    if (status?.state === "ready" && !this.force) {
      return [resolveTask]
    }

    const deps = this.action.getDependencyReferences().flatMap((dep): BaseTask[] => {
      const action = this.graph.getActionByRef(dep, { includeDisabled: true })
      const disabled = action.isDisabled()

      // Maybe we can make this easier to reason about... - JE
      if (dep.needsExecutedOutputs) {
        if (disabled && action.kind !== "Build") {
          // TODO-0.13.1: Need to handle conditional references, over in dependenciesFromAction()
          throw new GraphError({
            message: deline`
            ${this.action.longDescription()} depends on one or more runtime outputs from action
             ${styles.highlight(action.key())}, which is disabled.
             Please either remove the reference or enable the action.`,
          })
        }
        return [this.getExecuteTask(action)]
      } else if (dep.explicit) {
        if ((this.skipRuntimeDependencies || disabled) && dep.kind !== "Build") {
          if (dep.needsStaticOutputs) {
            return [this.getResolveTask(action)]
          } else {
            return []
          }
        } else {
          return [this.getExecuteTask(action)]
        }
      } else if (dep.needsStaticOutputs) {
        return [this.getResolveTask(action)]
      } else {
        return []
      }
    })

    return [resolveTask, ...deps]
  }

  // Helpers //

  protected getDependencyParams(): BaseActionTaskParams<T> {
    return {
      garden: this.garden,
      action: this.action,
      force: false,
      log: this.log,
      graph: this.graph,
      forceActions: this.forceActions,
      skipDependencies: this.skipDependencies,
      skipRuntimeDependencies: this.skipRuntimeDependencies,
    }
  }

  /**
   * Given a set of graph results, return a resolved version of the action.
   * Throws if the dependency results don't contain the required task results.
   */
  getResolvedAction(action: Action, dependencyResults: GraphResults): Resolved<T> {
    const resolveTask = this.getResolveTask(action)
    const result = dependencyResults.getResult(resolveTask)

    if (!result) {
      throw new InternalError({
        taskType: this.type,
        message: `Could not find resolved action '${action.key()}' when processing task '${this.getBaseKey()}'.`,
      })
    }

    return <Resolved<T>>result.outputs.resolvedAction
  }

  /**
   * Given a set of graph results, return an executed version of the action.
   * Throws if the dependency results don't contain the required task results.
   */
  getExecutedAction(action: Action, dependencyResults: GraphResults): Executed<T> {
    const execTask = this.getExecuteTask(action)
    const result = dependencyResults.getResult(execTask)

    if (!result) {
      throw new InternalError({
        taskType: this.type,
        message: `Could not find executed action '${action.key()}' when processing task '${this.getBaseKey()}'.`,
      })
    }

    return <Executed<T>>result.result?.executedAction
  }

  /**
   * Returns the ResolveActionTask for the given Action.
   */
  protected getResolveTask(action: Action) {
    const force = !!this.forceActions.find((r) => r.kind === action.kind && r.name === action.name)
    return action.getResolveTask({ ...this.getDependencyParams(), force })
  }

  /**
   * Returns the execution Task for the given Action, e.g. DeployTask for Deploy, BuildTask for Build etc.
   *
   * Note that this is not always the correct Task to perform when processing deps, e.g. for the DeleteDeployTask.
   */
  protected getExecuteTask(action: Action) {
    const force = !!this.forceActions.find((r) => r.kind === action.kind && r.name === action.name)
    return action.getExecuteTask({ ...this.getDependencyParams(), force })
  }
}

export interface ExecuteActionOutputs<T extends Action> extends BaseTaskOutputs {
  executedAction: Executed<T>
}

type ExecuteActionTaskType = "build" | "deploy" | "run" | "test"

const actionKindToEventNameMap = {
  build: "buildStatus",
  deploy: "deployStatus",
  test: "testStatus",
  run: "runStatus",
} satisfies { [key in ExecuteActionTaskType]: ActionStatusEventName }

const displayStates = {
  failed: "in a failed state",
  unknown: "in an unknown state",
}

/**
 * Just to make action states look nicer in print.
 */
function displayState(state: ActionState): string {
  return displayStates[state] || state.replace("-", " ")
}

/*+
 * Map of log strings used for logging the action lifecycle.
 */
const actionLogStrings = {
  Build: {
    ready: "built",
    notReady: `will be ${styles.highlight("built")}`,
    force: `will ${styles.highlight("force rebuild")}`,
    running: "Building",
  },
  Deploy: {
    ready: "deployed",
    notReady: `will be ${styles.highlight("deployed")}`,
    force: `will ${styles.highlight("force redeploy")}`,
    running: "Deploying",
  },
  Test: {
    ready: "run",
    notReady: `test will be ${styles.highlight("run")}`,
    force: `will ${styles.highlight("force rerun test")}`,
    running: "Testing",
  },
  Run: {
    ready: "run",
    notReady: `will be ${styles.highlight("run")}`,
    force: `will ${styles.highlight("force rerun")}`,
    running: "Running",
  },
}

/**
 * Decorator function for emitting status events to Cloud when calling the
 * getStatus method on ExecutionAction tasks and for logging the operation lifecycle
 * to the terminal.
 *
 * The wrapper emits the appropriate events before and after the inner function execution.
 */
export function logAndEmitGetStatusEvents<
  A extends Action,
  R extends ValidExecutionActionResultType = {
    state: ActionState
    outputs: A["_runtimeOutputs"]
    detail: any
    version: string
  },
>(
  _target: ExecuteActionTask<A>,
  methodName: "getStatus",
  descriptor: TypedPropertyDescriptor<(...args: [ActionTaskStatusParams<A>]) => Promise<R & ExecuteActionOutputs<A>>>
) {
  const method = descriptor.value

  if (!method) {
    throw new RuntimeError({ message: "No method to decorate" })
  }

  descriptor.value = async function (this: ExecuteActionTask<A>, ...args: [ActionTaskStatusParams<A>]) {
    const statusOnly = args[0].statusOnly
    // We don't emit events when just checking the status
    if (statusOnly) {
      const result = (await method.apply(this, args)) as R & ExecuteActionOutputs<A>
      return result
    }

    const log = this.log.createLog()
    const actionKindLowercased = this.action.kind.toLowerCase() as Lowercase<A["kind"]>
    const eventName = actionKindToEventNameMap[actionKindLowercased]
    const startedAt = new Date().toISOString()
    const styledName = styles.highlight(this.action.name)
    const logStrings = actionLogStrings[this.action.kind]

    const level = this.force ? "debug" : "info"
    log[level](
      `Getting status for ${this.action.kind} ${styledName} (type ${styles.highlight(this.action.type)}) at version ${this.action.versionString(log)}...`
    )

    // First we emit the "getting-status" event
    this.garden.events.emit(
      eventName,
      makeActionGetStatusPayload({
        action: this.action,
        force: this.force,
        startedAt,
        sessionId: this.garden.sessionId,
        runtime: undefined, // Runtime is unknown at this point
        log: this.log,
      })
    )

    try {
      const result = (await method.apply(this, args)) as R & ExecuteActionOutputs<A>

      const willRerun = this.force && !statusOnly
      if (result.state === "ready" && !willRerun) {
        log.success({ msg: `Already ${logStrings.ready}`, showDuration: false })
      } else if (result.state === "ready" && willRerun) {
        log.info(`${styledName} is already ${styles.highlight(logStrings.ready)}, ${logStrings.force}`)
      } else {
        const stateStr = styles.highlight(result.detail?.state || displayState(result.state))
        // we use debug log level here
        // because the next framework-level log messages will print about running the actions
        log.debug(`Status is ${stateStr}, ${styledName} ${logStrings.notReady}`)
      }

      // Then an event with the results if the status was successfully retrieved...
      const donePayload = makeActionCompletePayload({
        result,
        startedAt,
        action: this.action,
        operation: methodName,
        force: this.force,
        sessionId: this.garden.sessionId,
        runtime: (result.detail ?? {}).runtime,
        log: this.log,
      }) as Events[typeof eventName]

      this.garden.events.emit(eventName, donePayload)

      return result
    } catch (err) {
      // ...otherwise we emit a "failed" event

      // The error proper is logged downstream
      log.error("Failed")
      this.garden.events.emit(
        eventName,
        makeActionFailedPayload({
          startedAt,
          action: this.action,
          force: this.force,
          operation: methodName,
          sessionId: this.garden.sessionId,
          runtime: undefined, // Runtime is unknown as the getStatus handler failed
          log: this.log,
        })
      )

      throw err
    }
  }

  return descriptor
}

/**
 * Decorator function for emitting status events to Cloud when calling the
 * process method on ExecutionAction tasks and for logging the operation lifecycle
 * to the terminal.
 *
 * The wrapper emits the appropriate events before and after the inner function execution.
 */
export function logAndEmitProcessingEvents<
  A extends Action,
  R extends ValidExecutionActionResultType = {
    state: ActionState
    outputs: A["_runtimeOutputs"]
    detail: any
    version: string
  },
>(
  _target: ExecuteActionTask<A>,
  methodName: "process",
  descriptor: TypedPropertyDescriptor<
    (...args: [ActionTaskProcessParams<A, R>]) => Promise<R & ExecuteActionOutputs<A>>
  >
) {
  const method = descriptor.value

  if (!method) {
    throw new RuntimeError({ message: "No method to decorate" })
  }

  descriptor.value = async function (this: ExecuteActionTask<A>, ...args: [ActionTaskProcessParams<A, R>]) {
    const actionKind = this.action.kind.toLowerCase() as Lowercase<A["kind"]>
    const eventName = actionKindToEventNameMap[actionKind]
    const startedAt = new Date().toISOString()
    const log = this.log.createLog()
    const version = this.action.versionString(log)
    const logStrings = actionLogStrings[this.action.kind]
    log.info(
      `${logStrings.running} ${styles.highlight(this.action.name)} (type ${styles.highlight(
        this.action.type
      )}) at version ${styles.highlight(version)}...`
    )

    // getStatus handler returns planned runtime
    // status and detail might be null
    const status = args[0].status ?? undefined
    const statusDetail = status?.detail ?? undefined
    const statusRuntime: ActionRuntime | undefined = statusDetail?.runtime

    // First we emit the "processing" event
    this.garden.events.emit(
      eventName,
      makeActionProcessingPayload({
        startedAt,
        action: this.action,
        force: this.force,
        sessionId: this.garden.sessionId,
        runtime: statusRuntime,
        log: this.log,
      })
    )

    try {
      const result = (await method.apply(this, args)) as R & ExecuteActionOutputs<A>

      // Then an event with the results if the action was successfully executed...
      const donePayload = makeActionCompletePayload({
        startedAt,
        result,
        action: this.action,
        force: this.force,
        operation: methodName,
        sessionId: this.garden.sessionId,
        // process handler returns actual runtime; might fall back to other runtimes, if needed.
        runtime: result.detail?.runtime,
        log: this.log,
      }) as Events[typeof eventName]

      this.garden.events.emit(eventName, donePayload)
      log.success("Done")

      return result
    } catch (err) {
      // ...otherwise we emit a "failed" event

      // The error proper is logged downstream
      log.error("Failed")
      this.garden.events.emit(
        eventName,
        makeActionFailedPayload({
          startedAt,
          action: this.action,
          force: this.force,
          operation: methodName,
          sessionId: this.garden.sessionId,
          runtime: statusRuntime,
          log: this.log,
        })
      )

      throw err
    }
  }

  return descriptor
}

export abstract class ExecuteActionTask<
  T extends Action,
  O extends ValidExecutionActionResultType = {
    state: ActionState
    outputs: T["_runtimeOutputs"]
    detail: any
    version: string
  },
> extends BaseActionTask<T, O & ExecuteActionOutputs<T>> {
  override executeTask = true
  protected defaultExecuteConcurrencyLimit = 10
  protected defaultStatusConcurrencyLimit = 10

  override get executeConcurrencyLimit(): number {
    return this.action.executeConcurrencyLimit || this.defaultExecuteConcurrencyLimit
  }

  override get statusConcurrencyLimit(): number {
    return this.action.statusConcurrencyLimit || this.defaultStatusConcurrencyLimit
  }

  abstract override readonly type: Lowercase<T["kind"]>

  abstract override getStatus(params: ActionTaskStatusParams<T>): Promise<O & ExecuteActionOutputs<T>>

  abstract override process(params: ActionTaskProcessParams<T, O>): Promise<O & ExecuteActionOutputs<T>>

  async makeErrorMsg({ errorMsg, logOutput: logOutput }: { errorMsg?: string; logOutput?: string }) {
    const errorMsgBase = errorMsg || `The action failed but the error message is missing.`

    const logUrl = this.garden.cloudApi
      ? await this.garden.cloudApi.getActionLogUrl({
          sessionId: this.garden.sessionId,
          actionUid: this.action.uid,
        })
      : null

    // If a log link is available we don't append the output to the error but rather just show the link.
    // The link is printed elsewhere for better log readability.
    if (logOutput && !logUrl) {
      errorMsg = renderMessageWithDivider({
        prefix: `${errorMsgBase}${errorMsgBase.endsWith(".") ? "" : "."} Here's the output until the error occurred:`,
        msg: logOutput,
        isError: true,
        color: styles.error,
      }).msg
    } else {
      errorMsg = errorMsgBase
    }

    return errorMsg
  }
}

export type TaskResultType<T extends BaseTask<ValidResultType>> =
  T extends ExecuteActionTask<infer ActionType, infer ResultType>
    ? ResultType & ExecuteActionOutputs<ActionType>
    : T extends BaseTask<infer ResultType>
      ? ResultType & BaseTaskOutputs
      : never
