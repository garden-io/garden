/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { omit } from "lodash-es"
import EventEmitter2 from "eventemitter2"
import type { LogEntryEventPayload } from "../cloud/api-legacy/restful-event-stream.js"
import type { DeployStatusForEventPayload } from "../types/service.js"
import type { RunStatusForEventPayload } from "../plugin/base.js"
import type { Omit, PickFromUnion } from "../util/util.js"
import type { ConfigGraph, RenderedActionGraph } from "../graph/config-graph.js"
import type { CommandInfo, EventNamespaceStatus } from "../plugin-context.js"
import type { GraphResult } from "../graph/results.js"
import type { BuildStatusForEventPayload } from "../plugin/handlers/Build/get-status.js"
import type { ActionStatusPayload } from "./action-status-events.js"
import type { AuthToken } from "../cloud/common.js"
import type { AecAction, AecAgentInfo, AecTrigger } from "../config/aec.js"

interface EventContext {
  gardenKey?: string
  sessionId?: string
  _parentSessionId?: string
}

export type EventPayload<T extends EventName = EventName> = Events[T] & { $context?: EventContext }

export type GardenEventListener<T extends EventName> = (payload: EventPayload<T>) => void
export type GardenEventAnyListener<E extends EventName = any> = (name: E, payload: EventPayload<E>) => void

/**
 * This simple class serves as the central event bus for a Garden instance. Its function
 * is mainly to consolidate all events for the instance, to ensure type-safety.
 *
 * See below for the event interfaces.
 */
export class EventBus extends EventEmitter2.EventEmitter2 {
  private readonly keyIndex: {
    [key: string]: { [eventName: string]: ((payload: any) => void)[] }
  }

  constructor(private context: EventContext = {}) {
    super({
      wildcard: false,
      newListener: false,
      maxListeners: 50000, // we may need to adjust this
    })
    this.keyIndex = {}
  }

  override emit<T extends EventName>(name: T, payload: EventPayload<T>) {
    // The context set in the constructor is added on the $context field
    return super.emit(name, { $context: { ...payload.$context, ...this.context }, ...payload })
  }

  override on<T extends EventName>(name: T, listener: GardenEventListener<T>) {
    return super.on(name, listener)
  }

  /**
   * Registers the listener under the provided key for easy cleanup via `offKey`. This is useful e.g. for the
   * plugin event broker, which is instantiated in several places and where there isn't a single obvious place to
   * remove listeners from all instances generated in a single command run.
   */
  onKey<T extends EventName>(name: T, listener: GardenEventListener<T>, key: string) {
    if (!this.keyIndex[key]) {
      this.keyIndex[key] = {}
    }
    if (!this.keyIndex[key][name]) {
      this.keyIndex[key][name] = []
    }
    this.keyIndex[key][name].push(listener)
    return super.on(name, listener)
  }

  /**
   * Removes all event listeners for the event `name` that were registered under `key` (via `onKey`).
   */
  offKey<T extends EventName>(name: T, key: string) {
    if (!this.keyIndex[key]) {
      return
    }
    if (!this.keyIndex[key][name]) {
      return
    }
    for (const listener of this.keyIndex[key][name]) {
      this.removeListener(name, listener)
    }
    delete this.keyIndex[key][name]
  }

  /**
   * Removes all event listeners that were registered under `key` (via `onKey`).
   */
  clearKey(key: string) {
    if (!this.keyIndex[key]) {
      return
    }
    for (const name of Object.keys(this.keyIndex[key])) {
      for (const listener of this.keyIndex[key][name]) {
        this.removeListener(name, listener)
      }
    }
    delete this.keyIndex[key]
  }

  /**
   * Add the given listener if it's not already been added.
   * Basically an idempotent version of on(), which otherwise adds the same listener again if called twice with
   * the same listener.
   */
  ensure<T extends EventName>(name: T, listener: GardenEventListener<T>) {
    for (const l of this.listeners(name)) {
      if (l === listener) {
        return this
      }
    }
    return super.on(name, listener)
  }

  override onAny(listener: GardenEventAnyListener) {
    return super.onAny(<any>listener)
  }

  /**
   * Add the given listener if it's not already been added.
   * Basically an idempotent version of onAny(), which otherwise adds the same listener again if called twice with
   * the same listener.
   */
  ensureAny(listener: GardenEventAnyListener) {
    for (const l of this.listenersAny()) {
      if (l === listener) {
        return this
      }
    }
    return super.onAny(<any>listener)
  }

  override once<T extends EventName>(name: T, listener: GardenEventListener<T>) {
    return super.once(name, listener)
  }

  // TODO: wrap more methods to make them type-safe
}

/**
 * Supported logger events and their interfaces.
 */

export type GraphResultEventPayload = Omit<GraphResult, "result" | "task" | "dependencyResults" | "error"> & {
  error: string | null
}

export interface CommandInfoPayload extends CommandInfo {
  // Contains additional context for the command info available during init
  environmentName: string
  environmentId?: string
  projectName: string
  projectId?: string
  _projectApiVersion: string
  _projectRootDirAbs: string
  namespaceName: string
  namespaceId?: string
  coreVersion: string
  vcsBranch: string
  _vcsRepositoryRootDirAbs: string
  vcsCommitHash: string
  vcsOriginUrl: string
  sessionId: string
}

export function toGraphResultEventPayload(result: GraphResult): GraphResultEventPayload {
  return {
    ...omit(result, "result", "dependencyResults", "task"),
    error: result.error ? String(result.error) : null,
  }
}

/**
 * Supported Garden events and their interfaces.
 */
export interface Events {
  // Internal test/control events
  _exit: {}
  _restart: {}
  _test: { msg?: string }

  _workflowRunRegistered: {
    workflowRunUid: string
  }

  // Process events
  serversUpdated: {
    servers: { host: string; command: string; serverAuthKey: string }[]
  }
  connectionReady: {}
  receivedToken: AuthToken

  // Session events - one of these is emitted when the command process ends
  sessionCompleted: {} // Command exited with a 0 status
  sessionFailed: {} // Command exited with a nonzero status
  sessionCancelled: {} // Command exited because of an interrupt signal (e.g. CTRL-C)

  // Watcher events
  internalError: {
    timestamp: Date
    error: Error
  }
  // TODO: We may want to split this up into `projectConfigChanged` and `actionConfigChanged`, but we don't currently
  // need that distinction for our purposes.
  configChanged: {
    path: string
  }

  configGraph: { graph: ConfigGraph }
  configsScanned: {}

  autocompleterUpdated: { projectRoot: string }

  // Command/project metadata events
  commandInfo: CommandInfoPayload

  // Stack Graph events
  stackGraph: RenderedActionGraph

  /**
   * Line-by-line action log events. These are emitted by the `PluginEventBroker` instance passed to action handlers.
   *
   * This is in contrast with the `logEntry` event below, which represents framework-level logs emitted by the logger.
   *
   * TODO: Instead of having two event types (`log` and `logEntry`), we may want to unify the two.
   */
  log: {
    /**
     * ISO format date string
     */
    timestamp: string
    actionUid: string
    actionName: string
    actionType: string
    moduleName: string | null
    origin: string
    data: string
  }
  logEntry: LogEntryEventPayload

  // Action status events

  /**
   * In the `buildStatus`, `runStatus`, `testStatus` and `deployStatus` events, the optional `actionUid` field
   * identifies a single build/run/test/deploy.
   *
   * The `ActionRouter.build.build`/`ActionRouter.test.test`/`ActionRouter.run.run`/`ActionRouter.deploy.deploy`
   * actions emit two events: One before the plugin handler is called (a "building"/"running"/"deploying" event), and
   * another one after the handler finishes successfully or throws an error.
   *
   * When logged in, the `actionUid` is used by the Garden Cloud backend to group these two events for each of these
   * action invocations.
   *
   * No `actionUid` is set for the corresponding "get status/result" actions (e.g. `ActionRouter.build.getStatus` or
   * `ActionRouter.test.getResult`), since those actions don't result in a build/deploy/run being executed (so there
   * are no associated logs or timestamps to track).
   */

  buildStatus: ActionStatusPayload<BuildStatusForEventPayload>
  runStatus: ActionStatusPayload<RunStatusForEventPayload>
  testStatus: ActionStatusPayload<RunStatusForEventPayload>
  deployStatus: ActionStatusPayload<DeployStatusForEventPayload>
  namespaceStatus: EventNamespaceStatus

  // Workflow events
  workflowRunning: {}
  workflowComplete: {}
  workflowError: {}
  workflowStepProcessing: {
    index: number
  }
  workflowStepSkipped: {
    index: number
  }
  workflowStepComplete: {
    index: number
    durationMsec: number
  }
  workflowStepError: {
    index: number
    durationMsec: number
  }

  // AEC events
  aecAgentStatus: {
    aecAgentInfo: AecAgentInfo
    status: "running" | "stopped" | "error"
    statusDescription: string
  }
  aecAgentEnvironmentUpdate: AecAgentEnvironmentUpdate
}

export interface AecAgentEnvironmentUpdate {
  aecAgentInfo: AecAgentInfo
  environmentName: string
  matchedTriggers?: AecTrigger[]
  lastDeployed?: string
  statusDescription: string
  inProgress: boolean
  error: boolean
  actionTriggered?: AecAction
  success?: boolean
}

export type EventName = keyof Events

export type ActionStatusEventName = PickFromUnion<
  EventName,
  "buildStatus" | "deployStatus" | "testStatus" | "runStatus"
>
type PipedWsEventName = Extract<
  EventName,
  | "commandInfo"
  | "configChanged"
  | "configsScanned"
  | "autocompleterUpdated"
  | "sessionCancelled"
  | "sessionCompleted"
  | "sessionFailed"
>

// These are the events we POST over https via the CloudEventStream
const pipedEventNamesSet = new Set<EventName>([
  "_test",
  "_workflowRunRegistered",
  "configsScanned",
  "configChanged",
  "sessionCompleted",
  "sessionFailed",
  "sessionCancelled",
  "internalError",
  "log",
  "commandInfo",
  "namespaceStatus",
  "deployStatus",
  "stackGraph",
  "buildStatus",
  "runStatus",
  "testStatus",
  "workflowComplete",
  "workflowError",
  "workflowRunning",
  "workflowStepComplete",
  "workflowStepError",
  "workflowStepProcessing",
  "workflowStepSkipped",
])

// We send graph and config events over a websocket connection via the Garden server
const actionStatusEventNames = new Set<ActionStatusEventName>([
  "buildStatus",
  "deployStatus",
  "runStatus",
  "testStatus",
])
const pipedWsEventNamesSet = new Set<PipedWsEventName>([
  "commandInfo",
  "configsScanned",
  "configChanged",
  "autocompleterUpdated",
  "sessionCompleted",
  "sessionFailed",
  "sessionCancelled",
])

const isPipedEvent = (name: string, _payload: any): _payload is Events[EventName] => {
  return pipedEventNamesSet.has(<any>name)
}

const isPipedWsEvent = (name: string, _payload: any): _payload is Events[PipedWsEventName] => {
  return pipedWsEventNamesSet.has(<any>name)
}

const isActionStatusEvent = (name: string, _payload: any): _payload is Events[ActionStatusEventName] => {
  return actionStatusEventNames.has(<any>name)
}

export function shouldStreamWsEvent(name: string, payload: any) {
  const gardenKey = payload?.$context?.gardenKey

  if (gardenKey && isActionStatusEvent(name, payload)) {
    return true
  }
  if (isPipedWsEvent(name, payload)) {
    return true
  }

  return false
}

export function shouldStreamEvent(name: string, payload: any) {
  if (isPipedEvent(name, payload)) {
    return true
  }
  return false
}
