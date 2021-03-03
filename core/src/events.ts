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
import { RunStatus } from "./types/plugin/base"
import { Omit } from "./util/util"

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

  // Runtime status events
  taskStatus: {
    taskName: string
    status: RunStatus
  }
  testStatus: {
    testName: string
    moduleName: string
    status: RunStatus
  }
  serviceStatus: {
    serviceName: string
    status: Omit<ServiceStatus, "detail">
  }

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
export const eventNames: EventName[] = [
  "_exit",
  "_restart",
  "_test",
  "_workflowRunRegistered",
  "configAdded",
  "configRemoved",
  "internalError",
  "projectConfigChanged",
  "moduleConfigChanged",
  "moduleSourcesChanged",
  "moduleRemoved",
  "taskPending",
  "taskProcessing",
  "taskComplete",
  "taskError",
  "taskCancelled",
  "taskGraphProcessing",
  "taskGraphComplete",
  "watchingForChanges",
  "taskStatus",
  "testStatus",
  "serviceStatus",
  "workflowRunning",
  "workflowComplete",
  "workflowError",
  "workflowStepProcessing",
  "workflowStepSkipped",
  "workflowStepError",
  "workflowStepComplete",
]
