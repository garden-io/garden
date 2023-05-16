/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { omit } from "lodash"
import { EventEmitter2 } from "eventemitter2"
import type { LogEntryEventPayload } from "./cloud/buffered-event-stream"
import type { DeployState, DeployStatusForEventPayload } from "./types/service"
import type { RunState, RunStatusForEventPayload } from "./plugin/base"
import type { Omit } from "./util/util"
import type { AuthTokenResponse } from "./cloud/api"
import type { RenderedActionGraph } from "./graph/config-graph"
import type { CommandInfo } from "./plugin-context"
import type { GraphResult } from "./graph/results"
import { NamespaceStatus } from "./types/namespace"
import { BuildState, BuildStatusForEventPayload } from "./plugin/handlers/Build/get-status"
import { ActionStateForEvent } from "./actions/types"
import { sanitizeValue } from "./util/logging"

export type GardenEventListener<T extends EventName> = (payload: Events[T]) => void

/**
 * This simple class serves as the central event bus for a Garden instance. Its function
 * is mainly to consolidate all events for the instance, to ensure type-safety.
 *
 * See below for the event interfaces.
 */
export class EventBus extends EventEmitter2 {
  private keyIndex: {
    [key: string]: { [eventName: string]: ((payload: any) => void)[] }
  }

  constructor(name?: string) {
    super({
      wildcard: false,
      newListener: false,
      maxListeners: 5000, // we may need to adjust this
    })
    this.keyIndex = {}
  }

  emit<T extends EventName>(name: T, payload: Events[T]) {
    return super.emit(name, payload)
  }

  on<T extends EventName>(name: T, listener: (payload: Events[T]) => void) {
    return super.on(name, listener)
  }

  /**
   * Registers the listener under the provided key for easy cleanup via `offKey`. This is useful e.g. for the
   * plugin event broker, which is instantiated in several places and where there isn't a single obvious place to
   * remove listeners from all instances generated in a single command run.
   */
  onKey<T extends EventName>(name: T, listener: (payload: Events[T]) => void, key: string) {
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

  onAny(listener: <T extends EventName>(name: T, payload: Events[T]) => void) {
    return super.onAny(<any>listener)
  }

  once<T extends EventName>(name: T, listener: (payload: Events[T]) => void) {
    return super.once(name, listener)
  }

  // TODO: wrap more methods to make them type-safe
}

/**
 * Supported logger events and their interfaces.
 */

export type GraphResultEventPayload = Omit<GraphResult, "task" | "dependencyResults" | "error"> & {
  error: string | null
}

export interface CommandInfoPayload extends CommandInfo {
  // Contains additional context for the command info available during init
  environmentName: string
  environmentId: number | undefined
  projectName: string
  projectId: string
  namespaceName: string
  namespaceId: number | undefined
  coreVersion: string
  vcsBranch: string
  vcsCommitHash: string
  vcsOriginUrl: string
}

export function toGraphResultEventPayload(result: GraphResult): GraphResultEventPayload {
  const payload = sanitizeValue({
    ...omit(result, "dependencyResults", "task"),
    error: result.error ? String(result.error) : null,
  })
  if (payload.result) {
    // TODO: Use a combined blacklist of fields from all task types instead of hardcoding here.
    payload.result = omit(
      result.result,
      "dependencyResults",
      "log",
      "buildLog",
      "detail",
      "resolvedAction",
      "executedAction"
    )
  }
  return payload
}

export type ActionStatusDetailedState = DeployState | BuildState | RunState

export interface ActionStatusPayload<S = { state: ActionStatusDetailedState }> {
  actionName: string
  actionVersion: string
  actionUid: string
  moduleName: string | null // DEPRECATED: Remove in 0.14
  startedAt: string
  completedAt?: string
  state: ActionStateForEvent
  status: S
}

/**
 * Supported Garden events and their interfaces.
 */
export interface Events {
  // Internal test/control events
  _exit: {}
  _restart: {}
  _test: any
  _workflowRunRegistered: {
    workflowRunUid: string
  }

  // Process events
  serversUpdated: {
    servers: { host: string; command: string; serverAuthKey: string }[]
  }
  serverReady: {}
  receivedToken: AuthTokenResponse

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

  // Command/project metadata events
  commandInfo: CommandInfoPayload

  // Stack Graph events
  stackGraph: RenderedActionGraph

  // TODO: Remove these once the Cloud UI no longer uses them.

  // TaskGraph events
  taskProcessing: {
    /**
     * ISO format date string
     */
    startedAt: string
    key: string
    type: string
    name: string
    inputVersion: string
  }
  taskComplete: GraphResultEventPayload
  taskReady: GraphResult
  taskError: GraphResultEventPayload
  taskCancelled: {
    /**
     * ISO format date string
     */
    cancelledAt: string
    type: string
    key: string
    name: string
  }
  taskGraphProcessing: {
    /**
     * ISO format date string
     */
    startedAt: string
  }
  taskGraphComplete: {
    /**
     * ISO format date string
     */
    completedAt: string
  }
  watchingForChanges: {}
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
  namespaceStatus: NamespaceStatus

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
}

export type EventName = keyof Events

// Note: Does not include logger events.
export const pipedEventNames: EventName[] = [
  "_test",
  "_workflowRunRegistered",
  "sessionCompleted",
  "sessionFailed",
  "sessionCancelled",
  "internalError",
  "log",
  "commandInfo",
  "namespaceStatus",
  "deployStatus",
  "stackGraph",
  "taskCancelled",
  "taskComplete",
  "taskError",
  "taskGraphComplete",
  "taskGraphProcessing",
  "taskProcessing",
  "buildStatus",
  "runStatus",
  "testStatus",
  "watchingForChanges",
  "workflowComplete",
  "workflowError",
  "workflowRunning",
  "workflowStepComplete",
  "workflowStepError",
  "workflowStepProcessing",
  "workflowStepSkipped",
]
