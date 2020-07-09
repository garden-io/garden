/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { Events, EventName, EventBus, eventNames } from "../events"
import { LogEntryMetadata, LogEntry } from "../logger/log-entry"
import { chainMessages } from "../logger/renderers"
import { got } from "../util/http"
import { makeAuthHeader } from "./auth"
import { LogLevel } from "../logger/log-node"
import { gardenEnv } from "../constants"

export type StreamEvent = {
  name: EventName
  payload: Events[EventName]
  timestamp: Date
}

export interface LogEntryEvent {
  key: string
  parentKey: string | null
  revision: number
  msg: string | string[]
  timestamp: Date
  level: LogLevel
  data?: any
  section?: string
  metadata?: LogEntryMetadata
}

export function formatForEventStream(entry: LogEntry): LogEntryEvent {
  const { section, data } = entry.getMessageState()
  const { key, revision, level } = entry
  const parentKey = entry.parent ? entry.parent.key : null
  const metadata = entry.getMetadata()
  const msg = chainMessages(entry.getMessageStates() || [])
  const timestamp = new Date()
  return { key, parentKey, revision, msg, data, metadata, section, timestamp, level }
}

export const FLUSH_INTERVAL_MSEC = 1000
export const MAX_BATCH_SIZE = 100

export interface ConnectBufferedEventStreamParams {
  eventBus: EventBus
  clientAuthToken: string
  enterpriseDomain: string
  projectId: string
  environmentName: string
  namespace: string
}

/**
 * Buffers events and log entries and periodically POSTs them to Garden Enterprise if the user is logged in.
 *
 * Subscribes to logger events once, in the constructor.
 *
 * Subscribes to Garden events via the connect method, since we need to subscribe to the event bus of
 * new Garden instances (and unsubscribe from events from the previously connected Garden instance, if
 * any) e.g. when config changes during a watch-mode command.
 */
export class BufferedEventStream {
  private log: LogEntry
  public sessionId: string
  private eventBus: EventBus
  private enterpriseDomain: string
  private clientAuthToken: string
  private projectId: string
  private environmentName: string
  private namespace: string

  /**
   * We maintain this map to facilitate unsubscribing from a previously connected event bus
   * when a new event bus is connected.
   */
  private gardenEventListeners: { [eventName: string]: (payload: any) => void }

  private intervalId: NodeJS.Timer | null
  private bufferedEvents: StreamEvent[]
  private bufferedLogEntries: LogEntryEvent[]

  constructor(log: LogEntry, sessionId: string) {
    this.sessionId = sessionId
    this.log = log
    this.log.root.events.onAny((_name: string, payload: LogEntryEvent) => {
      this.streamLogEntry(payload)
    })
    this.bufferedEvents = []
    this.bufferedLogEntries = []
  }

  connect(params: ConnectBufferedEventStreamParams) {
    this.log.silly("BufferedEventStream: Connected")
    this.clientAuthToken = params.clientAuthToken
    this.enterpriseDomain = params.enterpriseDomain
    this.projectId = params.projectId
    this.environmentName = params.environmentName
    this.namespace = params.namespace

    if (!this.intervalId) {
      this.startInterval()
    }

    if (this.eventBus) {
      // We unsubscribe from the old event bus' events.
      this.unsubscribeFromGardenEvents(this.eventBus)
    }

    this.eventBus = params.eventBus
    this.subscribeToGardenEvents(this.eventBus)
  }

  subscribeToGardenEvents(eventBus: EventBus) {
    // We maintain this map to facilitate unsubscribing from events when the Garden instance is closed.
    const gardenEventListeners = {}
    for (const gardenEventName of eventNames) {
      const listener = (payload: LogEntryEvent) => this.streamEvent(gardenEventName, payload)
      gardenEventListeners[gardenEventName] = listener
      eventBus.on(gardenEventName, listener)
    }
    this.gardenEventListeners = gardenEventListeners
  }

  unsubscribeFromGardenEvents(eventBus: EventBus) {
    for (const [gardenEventName, listener] of Object.entries(this.gardenEventListeners)) {
      eventBus.removeListener(gardenEventName, listener)
    }
  }

  startInterval() {
    this.intervalId = setInterval(() => {
      this.flushBuffered({ flushAll: false })
    }, FLUSH_INTERVAL_MSEC)
  }

  async close() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    try {
      await this.flushBuffered({ flushAll: true })
    } catch (err) {
      /**
       * We don't throw an exception here, since a failure to stream events and log entries doesn't mean that the
       * command failed.
       */
      this.log.error(`Error while flushing events and log entries: ${err.message}`)
    }
  }

  streamEvent<T extends EventName>(name: T, payload: Events[T]) {
    this.bufferedEvents.push({
      name,
      payload,
      timestamp: new Date(),
    })
  }

  streamLogEntry(logEntry: LogEntryEvent) {
    this.bufferedLogEntries.push(logEntry)
  }

  // Note: Returns a promise.
  async flushEvents(events: StreamEvent[]) {
    if (events.length === 0) {
      return
    }
    const data = {
      events,
      workflowRunUid: gardenEnv.GARDEN_WORKFLOW_RUN_UID,
      sessionId: this.sessionId,
      projectUid: this.projectId,
      environment: this.environmentName,
      namespace: this.namespace,
    }
    const headers = makeAuthHeader(this.clientAuthToken)
    this.log.silly(`Flushing ${events.length} events to ${this.enterpriseDomain}/events`)
    this.log.silly(`--------`)
    this.log.silly(`data: ${JSON.stringify(data)}`)
    this.log.silly(`--------`)
    await got.post(`${this.enterpriseDomain}/events`, { json: data, headers }).catch((err) => {
      this.log.error(err)
    })
  }

  // Note: Returns a promise.
  async flushLogEntries(logEntries: LogEntryEvent[]) {
    if (logEntries.length === 0) {
      return
    }
    const data = {
      logEntries,
      workflowRunUid: gardenEnv.GARDEN_WORKFLOW_RUN_UID,
      sessionId: this.sessionId,
      projectUid: this.projectId,
    }
    const headers = makeAuthHeader(this.clientAuthToken)
    this.log.silly(`Flushing ${logEntries.length} log entries to ${this.enterpriseDomain}/log-entries`)
    this.log.silly(`--------`)
    this.log.silly(`data: ${JSON.stringify(data)}`)
    this.log.silly(`--------`)
    await got.post(`${this.enterpriseDomain}/log-entries`, { json: data, headers }).catch((err) => {
      this.log.error(err)
    })
  }

  flushBuffered({ flushAll = false }) {
    const eventsToFlush = this.bufferedEvents.splice(0, flushAll ? this.bufferedEvents.length : MAX_BATCH_SIZE)

    const logEntryFlushCount = flushAll
      ? this.bufferedLogEntries.length
      : MAX_BATCH_SIZE - this.bufferedLogEntries.length
    const logEntriesToFlush = this.bufferedLogEntries.splice(0, logEntryFlushCount)

    return Bluebird.all([this.flushEvents(eventsToFlush), this.flushLogEntries(logEntriesToFlush)])
  }
}
