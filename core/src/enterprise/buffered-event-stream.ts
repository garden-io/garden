/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/**
 * Task log event control flow
 * 1. plugin handler emits log event on plugin event broker
 * 2. action listens to log events from plugin event broker,
 *    augments with more data and passes it along to garden.events
 * 3. BufferedEventStream sends along to Garden Cloud
 *
 * Plugin handler control flow
 * 1. command.action calls garden.processTasks([task list]), which adds tasks to the task graph and waits
 * 2. Tasks and their dependencies are added to task graph
 * 3. Task graph concurrently processes tasks in dependency order
 * 4. Task calls action via action router
 * 5. Action router calls plugin handler
 * 6. Plugin handler does the actual work and returns a result
 */

import Bluebird from "bluebird"
import { omit } from "lodash"

import { Events, EventName, EventBus, pipedEventNames } from "../events"
import { LogEntryMetadata, LogEntry, LogEntryMessage } from "../logger/log-entry"
import { got } from "../util/http"

import { LogLevel } from "../logger/logger"
import { Garden } from "../garden"
import { EnterpriseApi, makeAuthHeader } from "./api"

export type StreamEvent = {
  name: EventName
  payload: Events[EventName]
  timestamp: Date
}

// TODO: Remove data, section, timestamp and msg once we've updated GE (it's included in the message)
export interface LogEntryEventPayload {
  key: string
  parentKey: string | null
  revision: number
  timestamp: Date
  level: LogLevel
  message: Omit<LogEntryMessage, "timestamp">
  metadata?: LogEntryMetadata
}

export function formatLogEntryForEventStream(entry: LogEntry): LogEntryEventPayload {
  const message = entry.getLatestMessage()
  const { key, revision, level } = entry
  const parentKey = entry.parent ? entry.parent.key : null
  const metadata = entry.getMetadata()
  return {
    key,
    parentKey,
    revision,
    metadata,
    timestamp: message.timestamp,
    level,
    message: omit(message, "timestamp"),
  }
}

interface StreamTarget {
  host?: string
  enterprise: boolean
  clientAuthToken?: string
}

export type StreamRecordType = "event" | "logEntry"

export interface ConnectBufferedEventStreamParams {
  targets?: StreamTarget[]
  streamEvents: boolean
  streamLogEntries: boolean
  garden: Garden
}

interface ApiBatchBase {
  workflowRunUid?: string
  sessionId: string | null
  projectUid?: string
}

export interface ApiEventBatch extends ApiBatchBase {
  events: StreamEvent[]
  environment: string
  namespace: string
}

export interface ApiLogBatch extends ApiBatchBase {
  logEntries: LogEntryEventPayload[]
}

export const controlEventNames: Set<EventName> = new Set(["_workflowRunRegistered"])

/**
 * Buffers events and log entries and periodically POSTs them to Garden Enterprise or another Garden service.
 *
 * Subscribes to logger events once, in the constructor.
 *
 * Subscribes to Garden events via the connect method, since we need to subscribe to the event bus of
 * new Garden instances (and unsubscribe from events from the previously connected Garden instance, if
 * any) e.g. when config changes during a watch-mode command.
 */
export class BufferedEventStream {
  protected log: LogEntry
  protected enterpriseApi?: EnterpriseApi
  public sessionId: string

  protected targets: StreamTarget[]
  protected streamEvents: boolean
  protected streamLogEntries: boolean
  protected eventNames: EventName[]

  protected garden: Garden
  private workflowRunUid: string | undefined

  /**
   * We maintain this map to facilitate unsubscribing from a previously connected event bus
   * when a new event bus is connected.
   */
  private gardenEventListeners: { [eventName: string]: (payload: any) => void }

  private intervalId: NodeJS.Timer | null
  private bufferedEvents: StreamEvent[]
  private bufferedLogEntries: LogEntryEventPayload[]
  protected intervalMsec = 1000

  /**
   * We use 600 kilobytes as the maximum combined size of the events / log entries in a given batch. This number
   * was chosen to fit comfortably below e.g. nginx' default max request size, while still being able to carry a decent
   * number of records.
   */
  private maxBatchBytes = 600 * 1024 // 600 kilobytes

  constructor({ log, enterpriseApi, sessionId }: { log: LogEntry; enterpriseApi?: EnterpriseApi; sessionId: string }) {
    this.sessionId = sessionId
    this.log = log
    this.enterpriseApi = enterpriseApi
    this.log.root.events.onAny((_name: string, payload: LogEntryEventPayload) => {
      this.streamLogEntry(payload)
    })
    this.bufferedEvents = []
    this.bufferedLogEntries = []
    this.targets = []
    this.eventNames = pipedEventNames
  }

  connect({ garden, targets, streamEvents, streamLogEntries }: ConnectBufferedEventStreamParams) {
    if (this.intervalId) {
      clearInterval(this.intervalId)
    }

    if (targets) {
      this.targets = targets
    }

    this.streamEvents = streamEvents
    this.streamLogEntries = streamLogEntries

    if (this.garden) {
      // We unsubscribe from the old event bus' events.
      this.unsubscribeFromGardenEvents(this.garden.events)
    }

    this.garden = garden
    this.subscribeToGardenEvents(this.garden.events)

    this.log.silly("BufferedEventStream: Connected")

    this.startInterval()
  }

  subscribeToGardenEvents(eventBus: EventBus) {
    // We maintain this map to facilitate unsubscribing from events when the Garden instance is closed.
    const gardenEventListeners = {}
    for (const gardenEventName of this.eventNames) {
      const listener = (payload: LogEntryEventPayload) => this.streamEvent(gardenEventName, payload)
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
      this.flushBuffered().catch((err) => {
        this.log.error(err)
      })
    }, this.intervalMsec)
  }

  async close() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    try {
      await this.flushAll()
      this.log.debug("Done flushing all events and log entries.")
    } catch (err) {
      /**
       * We don't throw an exception here, since a failure to stream events and log entries doesn't mean that the
       * command failed.
       */
      this.log.error(`Error while flushing events and log entries: ${err.message}`)
    }
  }

  streamEvent<T extends EventName>(name: T, payload: Events[T]) {
    if (controlEventNames.has(name)) {
      this.handleControlEvent(name, payload)
      return
    }

    if (this.streamEvents) {
      this.bufferedEvents.push({
        name,
        payload,
        timestamp: new Date(),
      })
    }
  }

  streamLogEntry(logEntry: LogEntryEventPayload) {
    if (this.streamLogEntries) {
      this.bufferedLogEntries.push(logEntry)
    }
  }

  async flushEvents(events: StreamEvent[]) {
    if (events.length === 0) {
      return
    }

    const data: ApiEventBatch = {
      events,
      workflowRunUid: this.workflowRunUid,
      sessionId: this.sessionId,
      projectUid: this.garden.projectId || undefined,
      environment: this.garden.environmentName,
      namespace: this.garden.namespace,
    }

    await this.postToTargets(`${events.length} events`, "events", data)
  }

  async flushLogEntries(logEntries: LogEntryEventPayload[]) {
    if (logEntries.length === 0 || !this.garden) {
      return
    }

    const data: ApiLogBatch = {
      logEntries,
      workflowRunUid: this.workflowRunUid,
      sessionId: this.sessionId,
      projectUid: this.garden.projectId || undefined,
    }

    await this.postToTargets(`${logEntries.length} log entries`, "log-entries", data)
  }

  private async postToTargets(description: string, path: string, data: ApiEventBatch | ApiLogBatch) {
    if (this.targets.length === 0) {
      this.log.silly("No targets to send events to. Dropping them.")
    }

    try {
      await Bluebird.map(this.targets, (target) => {
        if (target.enterprise && this.enterpriseApi?.domain) {
          this.log.silly(`Flushing ${description} to GE /${path}`)
          // Need to cast so the compiler doesn't complain that the two returns from the map
          // aren't equivalent. Shouldn't matter in this case since we're not collecting the return value.
          return this.enterpriseApi.post<any>(path, {
            body: data,
            retry: true,
            retryDescription: `Flushing ${description}`,
            maxRetries: 5,
          }) as any
        }
        const targetUrl = `${target.host}/${path}`
        this.log.silly(`Flushing ${description} to ${targetUrl}`)
        this.log.silly(`--------`)
        this.log.silly(`data: ${JSON.stringify(data)}`)
        this.log.silly(`--------`)

        const headers = makeAuthHeader(target.clientAuthToken || "")
        return got.post(`${targetUrl}`, { json: data, headers })
      })
    } catch (err) {
      /**
       * We don't throw an exception here, since a failure to stream events and log entries doesn't mean that the
       * command failed.
       */
      this.log.debug(`Error while flushing events and log entries: ${err.message}`)
    }
  }

  /**
   * Flushes all events and log entries until none remain, and returns a promise that resolves when all of them
   * have been posted to their targets.
   */
  async flushAll() {
    if (!this.garden || this.targets.length === 0) {
      return
    }

    this.log.silly(`Flushing all remaining events and log entries`)
    const flushPromises: Promise<any>[] = []
    try {
      while (this.bufferedEvents.length > 0 || this.bufferedLogEntries.length > 0) {
        this.log.silly(`remaining: ${this.bufferedEvents.length} events, ${this.bufferedLogEntries.length} log entries`)
        flushPromises.push(this.flushBuffered())
      }
    } catch (err) {
      throw err
    }
    return Bluebird.all(flushPromises)
  }

  async flushBuffered() {
    if (!this.garden || this.targets.length === 0) {
      return
    }

    const eventsToFlush = this.makeBatch(this.bufferedEvents)
    const logEntriesToFlush = this.makeBatch(this.bufferedLogEntries)

    return Bluebird.all([this.flushEvents(eventsToFlush), this.flushLogEntries(logEntriesToFlush)])
  }

  /**
   * Adds buffered records (events or log entries) to a batch until none remain or until their combined size
   * exceeds `MAX_MATCH_BYTES`, and returns the batch.
   */
  makeBatch<B>(buffered: B[]): B[] {
    const batch: B[] = []
    let batchBytes = 0
    while (batchBytes < this.maxBatchBytes && buffered.length > 0) {
      let nextRecordBytes = Buffer.from(JSON.stringify(buffered[0])).length
      if (nextRecordBytes > this.maxBatchBytes) {
        this.log.error(`Event or log entry too large to flush, dropping it.`)
        this.log.debug(JSON.stringify(buffered[0]))
        buffered.shift() // Drop first record.
        nextRecordBytes = Buffer.from(JSON.stringify(buffered[0])).length
      }
      if (batchBytes + nextRecordBytes > this.maxBatchBytes) {
        break
      }
      batch.push(buffered.shift() as B)
      batchBytes += nextRecordBytes
    }
    return batch
  }

  handleControlEvent<T extends EventName>(name: T, payload: Events[T]) {
    if (name === "_workflowRunRegistered") {
      this.workflowRunUid = payload.workflowRunUid
    }
  }
}
