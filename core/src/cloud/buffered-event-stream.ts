/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import stringify from "json-stringify-safe"

import type { EventName, Events, GardenEventAnyListener } from "../events/events.js"
import { shouldStreamEvent } from "../events/events.js"
import type { Log, LogContext, LogEntry, LogMetadata } from "../logger/log-entry.js"
import { got } from "../util/http.js"

import type { LogLevel } from "../logger/logger.js"
import type { Garden } from "../garden.js"
import type { CloudSession } from "./api.js"
import { getSection } from "../logger/renderers.js"
import { registerCleanupFunction } from "../util/util.js"
import { makeAuthHeader } from "./auth.js"
import { toGardenError } from "../exceptions.js"

const maxFlushFail = 10 // How many consecutive failures to flush events on a loop before stopping entirely
/**
 * We use 600 kilobytes as the maximum combined size of the events / log entries in a given batch. This number
 * was chosen to fit comfortably below e.g. nginx' default max request size, while still being able to carry a decent
 * number of records.
 */
const defaultMaxBatchBytes = 600 * 1024 // 600 kilobytes

export type StreamEvent = {
  name: EventName
  payload: Events[EventName]
  timestamp: Date
}

type LogEntryMessage = Pick<LogEntry, "msg" | "rawMsg" | "symbol" | "data" | "dataFormat"> & {
  section: string
  error: string
}

export interface LogEntryEventPayload {
  key: string
  timestamp: string
  level: LogLevel
  message: LogEntryMessage
  context: LogContext
  metadata?: LogMetadata
}

// TODO @eysi: Add log context to payload
export function formatLogEntryForEventStream(entry: LogEntry): LogEntryEventPayload {
  // TODO @eysi: We're sending the section for backwards compatibility but it shouldn't really be needed.
  const section = getSection(entry) || ""
  const error = entry.error ? toGardenError(entry.error).explain() : ""
  return {
    key: entry.key,
    metadata: entry.metadata,
    timestamp: entry.timestamp,
    level: entry.level,
    context: entry.context,
    message: {
      section,
      msg: entry.msg,
      error,
      rawMsg: entry.rawMsg,
      symbol: entry.symbol,
      data: entry.data,
      dataFormat: entry.dataFormat,
    },
  }
}

interface StreamTarget {
  host?: string
  enterprise: boolean
  clientAuthToken?: string
}

interface ApiBatchBase {
  workflowRunUid?: string
  sessionId: string | null
  projectUid?: string
}

export interface ApiEventBatch extends ApiBatchBase {
  events: StreamEvent[]
  environmentId: string
  namespaceId: string
  // TODO: Remove the `environment` and `namespace` params once we no longer need to support Cloud/Enterprise
  //   versions that expect them.
  environment: string
  namespace: string
}

export interface ApiLogBatch extends ApiBatchBase {
  logEntries: LogEntryEventPayload[]
}

export interface BufferedEventStreamParams {
  log: Log
  maxLogLevel: LogLevel
  cloudSession: CloudSession
  garden: Garden
  streamEvents?: boolean
  streamLogEntries?: boolean
  targets?: StreamTarget[]
  maxBatchBytes?: number
}

/**
 * Buffers events and log entries and periodically POSTs them to Garden Cloud or another Garden service.
 *
 * Subscribes to logger events once, in the constructor.
 *
 * Subscribes to Garden events via the connect method, since we need to subscribe to the event bus of
 * new Garden instances (and unsubscribe from events from the previously connected Garden instance, if
 * any) e.g. when config changes during a watch-mode command.
 */
export class BufferedEventStream {
  private readonly cloudSession: CloudSession
  private readonly garden: Garden

  private readonly log: Log
  private readonly maxLogLevel: LogLevel

  private readonly maxBatchBytes: number

  private readonly streamEvents: boolean
  private readonly streamLogEntries: boolean

  private readonly bufferedEvents: StreamEvent[]
  private readonly bufferedLogEntries: LogEntryEventPayload[]

  private readonly eventListener: GardenEventAnyListener
  private readonly logListener: GardenEventAnyListener<"logEntry">

  private readonly _targets: StreamTarget[]

  private readonly intervalMsec = 1000
  private intervalId: NodeJS.Timeout | null = null
  private flushFailCount = 0
  private closed: boolean

  private workflowRunUid: string | undefined

  constructor({
    log,
    maxLogLevel,
    cloudSession,
    garden,
    targets,
    streamEvents = true,
    streamLogEntries = true,
    maxBatchBytes = defaultMaxBatchBytes,
  }: BufferedEventStreamParams) {
    this.log = log
    this.maxLogLevel = maxLogLevel
    this.cloudSession = cloudSession
    this.garden = garden
    this._targets = targets || []
    this.streamEvents = streamEvents
    this.streamLogEntries = streamLogEntries
    this.bufferedEvents = []
    this.bufferedLogEntries = []
    this.closed = false
    this.flushFailCount = 0
    this.maxBatchBytes = maxBatchBytes

    registerCleanupFunction("stream-session-cancelled-event", () => {
      if (!this.closed) {
        this.emit("sessionCancelled", {})
        this.close().catch(() => {})
      }
    })

    this.logListener = (name, payload) => {
      if (name === "logEntry" && payload.level <= this.maxLogLevel) {
        this.streamLogEntry(payload)
      }
    }
    this.log.root.events.onAny(this.logListener)

    this.eventListener = (name, payload) => {
      if (shouldStreamEvent(name, payload)) {
        this.emit(name, payload)
      }
    }
    this.garden.events.onAny(this.eventListener)

    this.log.silly(() => "BufferedEventStream: Connected")
    this.startInterval()
  }

  startInterval() {
    this.intervalId = setInterval(() => {
      this.flushBuffered()
        .then(() => {
          // Reset the counter on success
          this.flushFailCount = 0
        })
        .catch((error) => {
          this.flushFailCount++
          this.log.error({ error })
          if (this.flushFailCount >= maxFlushFail) {
            this.stopInterval()
            this.log.debug(`Failed flushing log ${this.flushFailCount} times in a row, gonna take it easy now.`)
          }
        })
    }, this.intervalMsec)
  }

  stopInterval() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  async close() {
    if (this.closed) {
      return
    }

    this.closed = true

    this.stopInterval()

    this.garden.events.offAny(this.eventListener)
    this.log.root.events.offAny(this.logListener)

    try {
      await this.flushAll()
      this.log.debug("Done flushing all events and log entries.")
    } catch (err) {
      /**
       * We don't throw an exception here, since a failure to stream events and log entries doesn't mean that the
       * command failed.
       */
      this.log.error(`Error while flushing events and log entries: ${err}`)
    }
  }

  emit<T extends EventName>(name: T, payload: Events[T]) {
    if (name === "_workflowRunRegistered") {
      this.handleControlEvent(name, <Events["_workflowRunRegistered"]>payload)
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

  private getTargets() {
    return [{ enterprise: true }, ...this._targets]
  }

  private async flushEvents(events: StreamEvent[]) {
    if (events.length === 0) {
      return
    }

    const data: ApiEventBatch = {
      events,
      workflowRunUid: this.workflowRunUid,
      sessionId: this.garden.sessionId,
      projectUid: this.garden.projectId || undefined,
      environmentId: this.cloudSession.environmentId,
      namespaceId: this.cloudSession.namespaceId,
      environment: this.garden.environmentName,
      namespace: this.garden.namespace,
    }

    await this.postToTargets(`${events.length} events`, "events", data)
  }

  private async flushLogEntries(logEntries: LogEntryEventPayload[]) {
    if (logEntries.length === 0) {
      return
    }

    const data: ApiLogBatch = {
      logEntries,
      workflowRunUid: this.workflowRunUid,
      sessionId: this.garden.sessionId,
      projectUid: this.garden.projectId || undefined,
    }

    await this.postToTargets(`${logEntries.length} log entries`, "log-entries", data)
  }

  private async postToTargets(description: string, path: string, data: ApiEventBatch | ApiLogBatch) {
    if (this.getTargets().length === 0) {
      this.log.silly(() => "No targets to send events to. Dropping them.")
    }

    try {
      await Promise.all(
        this.getTargets().map((target) => {
          if (target.enterprise) {
            // Need to cast so the compiler doesn't complain that the two returns from the map
            // aren't equivalent. Shouldn't matter in this case since we're not collecting the return value.
            return this.cloudSession.api.post<any>(path, {
              body: data,
              retry: true,
              retryDescription: `Flushing ${description}`,
              maxRetries: 5,
            }) as any
          }
          const targetUrl = `${target.host}/${path}`
          this.log.silly(() => `Flushing ${description} to ${targetUrl}`)
          this.log.silly(() => `--------`)
          this.log.silly(() => `data: ${stringify(data)}`)
          this.log.silly(() => `--------`)

          const headers = makeAuthHeader(target.clientAuthToken || "")
          return got.post(`${targetUrl}`, { json: data, headers })
        })
      )
    } catch (err) {
      /**
       * We don't throw an exception here, since a failure to stream events and log entries doesn't mean that the
       * command failed.
       */
      this.log.debug(`Error while flushing events and log entries: ${err}`)
    }
  }

  /**
   * Flushes all events and log entries until none remain, and returns a promise that resolves when all of them
   * have been posted to their targets.
   */
  async flushAll() {
    if (this.getTargets().length === 0) {
      return
    }

    this.log.silly(() => `Flushing all remaining events and log entries`)

    const eventBatches = this.makeBatches(this.bufferedEvents)
    const logBatches = this.makeBatches(this.bufferedLogEntries)

    await Promise.all([
      ...eventBatches.map((batch) => this.flushEvents(batch)),
      ...logBatches.map((batch) => this.flushLogEntries(batch)),
    ])

    this.log.silly(() => `All events and log entries flushed`)
  }

  async flushBuffered() {
    if (this.getTargets().length === 0) {
      return
    }

    const eventsToFlush = this.makeBatch(this.bufferedEvents)
    const logEntriesToFlush = this.makeBatch(this.bufferedLogEntries)

    await Promise.all([this.flushEvents(eventsToFlush), this.flushLogEntries(logEntriesToFlush)])
  }

  /**
   * Split the given buffer into batches and clear the buffer.
   */
  makeBatches<B>(buffered: B[]): B[][] {
    const output: B[][] = []

    while (buffered.length > 0) {
      output.push(this.makeBatch(buffered))
    }

    return output
  }

  /**
   * Adds buffered records (events or log entries) to a batch until none remain or until their combined size
   * exceeds `MAX_MATCH_BYTES`, and returns the batch.
   */
  makeBatch<B>(buffered: B[]): B[] {
    const batch: B[] = []
    let batchBytes = 0
    while (batchBytes < this.maxBatchBytes && buffered.length > 0) {
      const nextRecordBytes = Buffer.from(stringify(buffered[0])).length
      if (nextRecordBytes > this.maxBatchBytes) {
        this.log.error(`Event or log entry too large to flush (${nextRecordBytes} bytes), dropping it.`)
        // Note: This must be a silly log to avoid recursion
        this.log.silly(() => stringify(buffered[0]))
        buffered.shift() // Drop first record.
        continue
      }
      if (batchBytes + nextRecordBytes > this.maxBatchBytes) {
        break
      }
      batch.push(buffered.shift() as B)
      batchBytes += nextRecordBytes
    }
    return batch
  }

  handleControlEvent<T extends "_workflowRunRegistered">(name: T, payload: Events[T]) {
    if (name === "_workflowRunRegistered") {
      this.workflowRunUid = payload.workflowRunUid
    }
  }
}
