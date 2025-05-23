/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { timestampFromDate } from "@bufbuild/protobuf/wkt"
import type { ULID } from "ulid"
import { monotonicFactory, ulid } from "ulid"
import type { GardenWithNewBackend } from "../../garden.js"
import { registerCleanupFunction, sleep } from "../../util/util.js"
import type { Log } from "../../logger/log-entry.js"
import type { EventName, EventPayload, GardenEventAnyListener } from "../../events/events.js"
import { LogLevel } from "../../logger/logger.js"
import type { LogEntryEventPayload } from "../buffered-event-stream.js"
import type {
  Event as GrpcEvent,
  GardenEventIngestionService,
  EventResponse,
} from "@buf/garden_grow-platform.bufbuild_es/public/events/events_pb.js"
import { EventContextSchema, EventSchema } from "@buf/garden_grow-platform.bufbuild_es/public/events/events_pb.js"
import { create } from "@bufbuild/protobuf"
import { ConnectError, type Client } from "@connectrpc/connect"
import type { WritableIterable } from "@connectrpc/connect/protocol"
import { createWritableIterable } from "@connectrpc/connect/protocol"
import {
  GardenCommandEvent_GardenProjectMetadataSchema,
  GardenCommandEvent_GitMetadata_GitRemoteSchema,
  GardenCommandEvent_GitMetadataSchema,
  GardenCommandEvent_InvocationMetadataSchema,
  GardenCommandEvent_Status,
  GardenCommandEventSchema,
} from "@buf/garden_grow-platform.bufbuild_es/public/events/garden-command/garden-command_pb.js"

const nextEventUlid = monotonicFactory()

// remove this once the new event system is in production
const isNewBackendEventSystemInProduction = false

export class GrowBufferedEventStream {
  private readonly garden: GardenWithNewBackend
  private readonly log: Log

  private readonly eventListener: GardenEventAnyListener<EventName>
  private readonly logListener: GardenEventAnyListener<"logEntry">

  private readonly shouldStreamLogEntries: boolean

  private readonly eventIngestionService: Client<typeof GardenEventIngestionService>

  /**
   * Maps a globally _monotonic_ ULID (event ID) to the corresponding event's payload.
   */
  private readonly eventBuffer = new Map<string, GrpcEvent>()

  private outputStream: WritableIterable<GrpcEvent> | undefined
  private isClosed: boolean
  private readonly closeCallbacks: (() => void)[] = []

  private readonly sessionIdToUlidMap = new Map<string, ULID>()

  constructor({
    garden,
    log,
    eventIngestionService,
    shouldStreamLogEntries,
  }: {
    garden: GardenWithNewBackend
    log: Log
    eventIngestionService: Client<typeof GardenEventIngestionService>
    shouldStreamLogEntries: boolean
  }) {
    this.garden = garden
    this.log = log
    this.eventIngestionService = eventIngestionService
    this.isClosed = false
    this.shouldStreamLogEntries = shouldStreamLogEntries

    // TODO: make sure it waits for the callback function completion
    registerCleanupFunction("grow-stream-session-cancelled-event", () => {
      if (this.isClosed) {
        return
      }

      this.handleEvent("sessionCancelled", {})
      this.close().catch(() => {})
    })

    this.logListener = (name, payload) => {
      if (name === "logEntry" && payload.level <= LogLevel.debug) {
        this.handleLogEntry(payload)
      }
    }
    this.log.root.events.onAny(this.logListener)

    this.eventListener = async (name, payload) => {
      this.handleEvent(name, payload)
    }
    this.garden.events.onAny(this.eventListener)

    setTimeout(async () => {
      this.log.silly("GrowBufferedEventStream: Starting loop")

      while (!this.isClosed) {
        this.log.silly("GrowBufferedEventStream: Connecting ...")

        try {
          await this.streamEvents()
        } catch (err) {
          if (err instanceof ConnectError) {
            this.log.silly(`GrowBufferedEventStream: Error while streaming events: ${err}`)
            this.log.silly("GrowBufferedEventStream: Retrying in 1 second...")
            await sleep(1000)
          } else if (!isNewBackendEventSystemInProduction) {
            // This is a temporary workaround to avoid crashing the process when the new event system is not in production.
            // In production, we want to crash the process to surface the issue.
            this.log.debug(`GrowBufferedEventStream: Unexpected error while streaming events: ${err}`)
            this.log.debug("GrowBufferedEventStream: Bailing out.")
            break
          } else {
            // This will become an unhandled error and will cause the process to crash.
            throw err
          }
        }
      }
    }, 0)
  }

  async close() {
    if (this.isClosed) {
      return
    }

    this.garden.events.offAny(this.eventListener)
    this.log.root.events.offAny(this.logListener)

    if (this.eventBuffer.size === 0) {
      this.log.silly(
        "GrowBufferedEventStream: Close called and no events waiting for acknowledgement. Disconnecting..."
      )
      this.isClosed = true
      // close the connection as well
      this.outputStream?.close()
      return
    }

    // there are still events in the buffer, we need to wait for them to be acknowledged
    const promise = new Promise<void>((resolve) => {
      this.closeCallbacks.push(resolve)
    })

    const timeout = isNewBackendEventSystemInProduction ? 10000 : 1000 // use 1 second to avoid long waits when we didn't launch the event system yet.
    // wait max 10 seconds for the events to be acknowledged
    await Promise.race([
      promise,
      (async () => {
        await sleep(timeout)
        const logWarn = isNewBackendEventSystemInProduction
          ? this.log.warn.bind(this.log)
          : this.log.debug.bind(this.log)
        logWarn(
          `Not all events were acknowledged within ${timeout / 1000} seconds. Information in Garden Cloud may be incomplete.`
        )
      })(),
    ])

    this.isClosed = true
    this.outputStream?.close()
  }

  /**
   * Maps a legacy {@code sessionId} value to a valid ULID.
   *
   * The mapping persists in the {@link #sessionIdToUlidMap}
   * until it's explicitly evicted via {@link #eraseSessionUlid}.
   */
  private getSessionUlid(sessionId: string): ULID {
    const existingSessionUlid = this.sessionIdToUlidMap.get(sessionId)
    if (!!existingSessionUlid) {
      return existingSessionUlid
    }

    const generatedSessionUlid = ulid()
    this.sessionIdToUlidMap.set(sessionId, generatedSessionUlid)
    return generatedSessionUlid
  }

  /**
   * Deletes a mapping produced by {@link #getSessionUlid}.
   */
  private eraseSessionUlid(sessionId: string): boolean {
    return this.sessionIdToUlidMap.delete(sessionId)
  }

  private handleEvent<T extends EventName>(name: T, payload: EventPayload<T>) {
    // Use the parent session ID of the event payload,
    // if not available session ID of the event payload ID,
    // if not available use the garden session ID.
    // This means outside `garden dev` and `garden serve,
    // the session ID will always be the same as the command ID (As we're using the session ID as command ID).
    const sessionId = payload.$context?._parentSessionId || payload.$context?.sessionId || this.garden.sessionId
    // FIXME: generate new ulid and use translation map

    const event: GrpcEvent = create(EventSchema, {
      eventId: nextEventUlid(),
      context: create(EventContextSchema, {
        organizationId: this.garden.cloudApiV2.organizationId,
        sessionId,
      }),
    })

    if (name === "commandInfo") {
      this.handleCommandStarted({ sessionId, event, payload: payload as EventPayload<"commandInfo"> })
    }
    if (name === "sessionCompleted") {
      this.handleCommandCompleted({ sessionId, event, payload: payload as EventPayload<"sessionCompleted"> })
    }
    if (name === "sessionFailed") {
      this.handleCommandFailed({ sessionId, event, payload: payload as EventPayload<"sessionFailed"> })
    }

    if (event.eventData.value === undefined) {
      this.log.silly(`GrowBufferedEventStream: Ignoring event ${name} (ulid=${event.eventId})`)
      return
    }

    this.log.silly(
      () =>
        `GrowBufferedEventStream: ${this.outputStream ? "Sending" : "Buffering"} event ${event.eventData.case} (ulid=${event.eventId})`
    )
    this.log.silly(
      () => `GrowBufferedEventStream: ${JSON.stringify(event, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`
    )

    this.eventBuffer.set(event.eventId, event)

    // NOTE: we don't need to wait for the promise to resolve.
    // If sending the event fails, it will be retried as it lives in the event buffer.
    // See the caller of `streamEvents`.
    void this.outputStream?.write(event).catch((_) => undefined)
  }

  private handleCommandCompleted({
    sessionId,
    event,
  }: {
    sessionId: string
    event: GrpcEvent
    payload: EventPayload<"sessionCompleted">
  }) {
    const commandId = this.getSessionUlid(sessionId)

    event.eventData = {
      case: "commandEvent",
      value: create(GardenCommandEventSchema, {
        commandId,

        // completed now
        completedAt: timestampFromDate(new Date()),
        status: GardenCommandEvent_Status.SUCCEEDED,
      }),
    }
  }

  private handleCommandFailed({
    sessionId,
    event,
  }: {
    sessionId: string
    event: GrpcEvent
    payload: EventPayload<"sessionFailed">
  }) {
    const commandId = this.getSessionUlid(sessionId)

    event.eventData = {
      case: "commandEvent",
      value: create(GardenCommandEventSchema, {
        commandId,

        // completed now
        completedAt: timestampFromDate(new Date()),
        status: GardenCommandEvent_Status.FAILED,
      }),
    }
  }

  private handleCommandStarted({
    sessionId,
    event,
    payload,
  }: {
    sessionId: string
    event: GrpcEvent
    payload: EventPayload<"commandInfo">
  }) {
    const commandId = this.getSessionUlid(sessionId)

    event.eventData = {
      case: "commandEvent",
      value: create(GardenCommandEventSchema, {
        commandId,

        // started now
        startedAt: timestampFromDate(new Date()),
        status: GardenCommandEvent_Status.IN_PROGRESS,

        // TODO: expose if it is a custom command
        //isCustomCommand: payload.isCustomCommand,

        invocationMetadata: create(GardenCommandEvent_InvocationMetadataSchema, {
          cwd: process.cwd(),
          command: payload.name,
          // TODO: args
          //args: payload.args,
          // TODO: tty detection
          //interactiveTty: payload.interactiveTty,
        }),

        gitMetadata: create(GardenCommandEvent_GitMetadataSchema, {
          // TODO: repository root
          //repositoryRoot: payload.repositoryRoot,
          headRefSha: payload.vcsCommitHash,
          // TODO: expose raw ref name, might be a tag
          // TODO: might be optional if the head is detached
          headRefName: `refs/heads/${payload.vcsBranch}`,
          // TODO: expose all remotes with their original names
          gitRemotes: [
            create(GardenCommandEvent_GitMetadata_GitRemoteSchema, {
              name: "origin",
              url: payload.vcsOriginUrl,
            }),
          ],
        }),

        gardenProjectMetadata: create(GardenCommandEvent_GardenProjectMetadataSchema, {
          projectName: payload.projectName,

          // TODO: expose all project data

          // projectApiVersion: payload.projectApiVersion,

          // projectId: payload.projectId,
          // projectRootDir: payload.projectRootDir,

          // namespaceName: payload.namespaceName,
          // namespaceId: payload.namespaceId,

          // environmentName: payload.environmentName,
          // environmentId: payload.environmentId,
        }),
      }),
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private handleLogEntry(logEntry: LogEntryEventPayload) {
    if (!this.shouldStreamLogEntries) {
      return
    }
    // TODO: logs handling
  }

  private async streamEvents() {
    this.outputStream = createWritableIterable<GrpcEvent>()

    const ackStream = this.eventIngestionService.ingestEventStream(this.outputStream)

    this.log.silly(() => "GrowBufferedEventStream: Connected")

    // we synchronously flush all events into the output stream, to ensure that we don't send events out-of-order
    this.flushEventBuffer()

    try {
      await this.consumeAcks(ackStream)
    } finally {
      this.outputStream?.close()
      this.outputStream = undefined
    }
  }

  private async consumeAcks(ackStream: AsyncIterable<EventResponse>) {
    for await (const nextAck of ackStream) {
      if (!nextAck.success) {
        this.log.silly(`GrowBufferedEventStream: Server failed to process event with ulid=${nextAck.eventId}`)
        continue // NOTE: We expect the server to also close the stream in case of an error, but let's first receive all outstanding acks and errors.
      }

      // Remove acknowledged event from the buffer
      this.log.silly(() => `GrowBufferedEventStream: Received ack for event ${nextAck.eventId}`)
      this.eventBuffer.delete(nextAck.eventId)

      if (this.closeCallbacks.length && this.eventBuffer.size === 0) {
        this.log.silly("GrowBufferedEventStream: All events have been acknowledged. Disconnecting...")
        for (const callback of this.closeCallbacks) {
          // Call all the callbacks to notify that the stream is closed
          callback()
        }
        this.closeCallbacks.length = 0
        break
      }
    }
  }

  /**
   * Flushes the event buffer to the output stream.
   * We do this in synchronous fashion (without waiting for the event to be consumed) to avoid
   * out-of-order events, if we receive new events while we're still flushing.
   */
  private flushEventBuffer() {
    if (this.eventBuffer.size === 0) {
      return
    }

    this.log.silly(() => `GrowBufferedEventStream: Flushing ${this.eventBuffer.size} events from the buffer`)
    // NOTE: The Map implementation in the javascript runtime guarantees that values will be iterated in the order they were added (FIFO).
    for (const event of this.eventBuffer.values()) {
      if (!this.outputStream) {
        this.log.silly(() => `GrowBufferedEventStream: Stream closed during flush`)
        break
      }
      // NOTE: we're not waiting for the promise to resolve on purpose, as we want to synchronously flush all events
      // to the underlying queue avoiding out-of-order event transmission.
      void this.outputStream.write(event).catch((_) => undefined)
    }
  }
}
