/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { timestampFromDate } from "@bufbuild/protobuf/wkt"
import { monotonicFactory, uuidToULID } from "ulid"
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
} from "@buf/garden_grow-platform.bufbuild_es/private/events/events_pb.js"
import { EventContextSchema, EventSchema } from "@buf/garden_grow-platform.bufbuild_es/private/events/events_pb.js"
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
} from "@buf/garden_grow-platform.bufbuild_es/private/events/garden-command/garden-command_pb.js"

const nextEventUlid = monotonicFactory()

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

    // wait max 10 seconds for the events to be acknowledged
    await Promise.race([
      promise,
      (async () => {
        await sleep(10000)
        this.log.warn(
          "Not all events were acknowledged within 10 seconds. Information in Garden Cloud may be incomplete."
        )
      })(),
    ])

    this.outputStream?.close()
    this.isClosed = true
  }

  private handleEvent<T extends EventName>(name: T, payload: EventPayload<T>) {
    // use the parent session ID of the event payload, if not available use the garden parent session ID, if not available use the garden session ID
    // This means outside of `garden dev`, the session ID will always be the same as the command ID (As we're using the session ID as command ID).
    const parentSessionUlid =
      payload.$context?._parentSessionUlid || this.garden.parentSessionUlid || this.garden.sessionUlid
    const event: GrpcEvent = create(EventSchema, {
      eventId: nextEventUlid(),
      context: create(EventContextSchema, {
        organizationId: this.garden.cloudApiV2.organizationId,
        sessionId: parentSessionUlid,
      }),
    })

    if (name === "commandInfo") {
      this.handleCommandStarted(event, payload as EventPayload<"commandInfo">)
    }
    if (name === "sessionCompleted") {
      this.handleCommandCompleted(event, payload as EventPayload<"sessionCompleted">)
    }
    if (name === "sessionFailed") {
      this.handleCommandFailed(event, payload as EventPayload<"sessionFailed">)
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

  private handleCommandCompleted(event: GrpcEvent, payload: EventPayload<"sessionCompleted">) {
    const sessionUid = payload.$context?.sessionId // this will be defined if we're in a `garden dev` or `garden serve` session.
    const commandId = sessionUid ? uuidToULID(sessionUid) : this.garden.sessionUlid

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
  private handleCommandFailed(event: GrpcEvent, payload: EventPayload<"sessionFailed">) {
    const sessionUid = payload.$context?.sessionId // this will be defined if we're in a `garden dev` or `garden serve` session.
    const commandId = sessionUid ? uuidToULID(sessionUid) : this.garden.sessionUlid

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

  private handleCommandStarted(event: GrpcEvent, payload: EventPayload<"commandInfo">) {
    const sessionUid = payload.$context?.sessionId // this will be defined if we're in a `garden dev` or `garden serve` session.
    const commandId = sessionUid ? uuidToULID(sessionUid) : this.garden.sessionUlid

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
        // NOTE: We expect the server to also close the stream in case of an error, so we can retry emitting events on the next attempt.
        this.log.silly(`Server failed to process event with ulid=${nextAck.eventId}`)
      }

      // Remove acknowledged event from the buffer
      this.log.silly(() => `GrowBufferedEventStream: Received ack for event ${nextAck.eventId}`)
      this.eventBuffer.delete(nextAck.eventId)

      if (this.closeCallbacks.length && this.eventBuffer.size === 0) {
        this.log.silly("All events have been acknowledged. Disconnecting...")
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
