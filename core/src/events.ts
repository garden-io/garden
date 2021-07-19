/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { omit } from "lodash"
import { EventEmitter2 } from "eventemitter2"
import { GraphResult } from "./task-graph"
import { LogEntryEventPayload } from "./enterprise/buffered-event-stream"
import { ServiceStatus } from "./types/service"
import { NamespaceStatus, RunStatus } from "./types/plugin/base"
import { Omit } from "./util/util"
import { AuthTokenResponse } from "./enterprise/api"
import { RenderedActionGraph } from "./config-graph"
import { BuildState } from "./types/plugin/module/build"

export type GardenEventListener<T extends EventName> = (payload: Events[T]) => void

/**
 * This simple class serves as the central event bus for a Garden instance. Its function
 * is mainly to consolidate all events for the instance, to ensure type-safety.
 *
 * See below for the event interfaces.
 */
export class EventBus extends EventEmitter2 {
  constructor() {
    super({
      wildcard: false,
      newListener: false,
      maxListeners: 100, // we may need to adjust this
    })
  }

  emit<T extends EventName>(name: T, payload: Events[T]) {
    return super.emit(name, payload)
  }

  on<T extends EventName>(name: T, listener: (payload: Events[T]) => void) {
    return super.on(name, listener)
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
export interface LoggerEvents {
  _test: any
  logEntry: LogEntryEventPayload
}

export type LoggerEventName = keyof LoggerEvents

export type GraphResultEventPayload = Omit<GraphResult, "dependencyResults">

export function toGraphResultEventPayload(result: GraphResult): GraphResultEventPayload {
  const payload = omit(result, "dependencyResults")
  if (result.output) {
    payload.output = omit(result.output, "dependencyResults", "log", "buildLog")
    if (result.output.version) {
      payload.output.version = result.output.version.versionString || null
    }
  }
  return payload
}

/**
 * Supported Garden events and their interfaces.
 */
export interface Events extends LoggerEvents {
  // Internal test/control events
  _exit: {}
  _restart: {}
  _test: any
  _workflowRunRegistered: {
    workflowRunUid: string
  }

  // Process events
  serversUpdated: {
    servers: { host: string; command: string }[]
  }
  receivedToken: AuthTokenResponse

  // Watcher events
  configAdded: {
    path: string
  }
  configRemoved: {
    path: string
  }
  internalError: {
    timestamp: Date
    error: Error
  }
  projectConfigChanged: {}
  moduleConfigChanged: {
    names: string[]
    path: string
  }
  moduleSourcesChanged: {
    names: string[]
    pathsChanged: string[]
  }
  moduleRemoved: {}

  // Stack Graph events
  stackGraph: RenderedActionGraph

  // TaskGraph events
  taskPending: {
    addedAt: Date
    batchId: string
    key: string
    type: string
    name: string
  }
  taskProcessing: {
    startedAt: Date
    batchId: string
    key: string
    type: string
    name: string
    versionString: string
  }
  taskComplete: GraphResultEventPayload
  taskError: GraphResultEventPayload
  taskCancelled: {
    cancelledAt: Date
    batchId: string
    type: string
    key: string
    name: string
  }
  taskGraphProcessing: {
    startedAt: Date
  }
  taskGraphComplete: {
    completedAt: Date
  }
  watchingForChanges: {}
  log: {
    timestamp: number
    actionUid: string
    entity: {
      moduleName: string
      type: string
      key: string
    }
    data: string
  }

  // Status events

  /**
   * In the `buildStatus`, `taskStatus`, `testStatus` and `serviceStatus` events, the optional `actionUid` field
   * identifies a single build/deploy/run.
   *
   * The `build`/`testModule`/`runTask`/`deployService` actions emit two events: One before the plugin handler is
   * called (a "building"/"running"/"deploying" event), and another one after the handler finishes successfully or
   * throws an error.
   *
   * When logged in, the `actionUid` is used by the Garden Cloud backend to group these two events for each of these
   * action invocations.
   *
   * No `actionUid` is set for the corresponding "get status" actions (e.g. `getBuildStatus` or `getServiceStatus`),
   * since those actions don't result in a build/deploy/run (so there are no associated logs or timestamps to track).
   */

  buildStatus: {
    moduleName: string
    moduleVersion: string
    /**
     * `actionUid` should only be defined if `state = "building" | "built" | "failed"` (and not if `state = "fetched",
     * since in that case, no build took place and there are no logs/timestamps to view).
     */
    actionUid?: string
    status: {
      state: BuildState
      startedAt?: Date
      completedAt?: Date
    }
  }
  taskStatus: {
    taskName: string
    moduleName: string
    moduleVersion: string
    taskVersion: string
    /**
     * `actionUid` should only be defined if the task was run , i.e. if `state = "running" | "succeeded" | "failed"`
     * (and not if `state = "outdated" | "not-implemented, since in that case, no run took place and there are no
     * logs/timestamps to view).
     */
    actionUid?: string
    status: RunStatus
  }
  testStatus: {
    testName: string
    moduleName: string
    moduleVersion: string
    testVersion: string
    /**
     * `actionUid` should only be defined if the test was run, i.e. if `state = "running" | "succeeded" | "failed"`
     * (and not if `state = "outdated" | "not-implemented, since in that case, no run took place and there are no
     * logs/timestamps to view).
     */
    actionUid?: string
    status: RunStatus
  }
  serviceStatus: {
    serviceName: string
    moduleName: string
    moduleVersion: string
    serviceVersion: string
    /**
     * `actionUid` should only be defined if a deploy took place (i.e. when emitted from the `deployService` action).
     */
    actionUid?: string
    status: Omit<ServiceStatus, "detail">
  }
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
  "_exit",
  "_restart",
  "_test",
  "_workflowRunRegistered",
  "configAdded",
  "configRemoved",
  "internalError",
  "log",
  "moduleConfigChanged",
  "moduleRemoved",
  "moduleSourcesChanged",
  "namespaceStatus",
  "projectConfigChanged",
  "serviceStatus",
  "stackGraph",
  "taskCancelled",
  "taskComplete",
  "taskError",
  "taskGraphComplete",
  "taskGraphProcessing",
  "taskPending",
  "taskProcessing",
  "buildStatus",
  "taskStatus",
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
