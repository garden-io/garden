/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ULID } from "ulid"
import type { GardenWithNewBackend } from "../../garden.js"
import { registerCleanupFunction, sleep } from "../../util/util.js"
import type { Log } from "../../logger/log-entry.js"
import type { EventName, EventPayload, GardenEventAnyListener } from "../../events/events.js"
import { LogLevel } from "../../logger/logger.js"
import type { LogEntryEventPayload } from "../restful-event-stream.js"
import type {
  Event as GrpcEventEnvelope,
  GardenEventIngestionService,
  EventResponse,
} from "@buf/garden_grow-platform.bufbuild_es/public/events/events_pb.js"
import { EventResponse_Message_Severity } from "@buf/garden_grow-platform.bufbuild_es/public/events/events_pb.js"
import { ConnectError, type Client } from "@connectrpc/connect"
import type { WritableIterable } from "@connectrpc/connect/protocol"
import { createWritableIterable } from "@connectrpc/connect/protocol"

import { GrowCloudError } from "./api.js"
import { describeGrpcEvent, GrpcEventConverter } from "./grpc-event-converter.js"

export class GrpcEventStream {
  private readonly garden: GardenWithNewBackend
  private readonly log: Log

  private readonly eventListener: GardenEventAnyListener<EventName>
  private readonly logListener: GardenEventAnyListener<"logEntry">

  private readonly shouldStreamLogEntries: boolean

  private readonly eventIngestionService: Client<typeof GardenEventIngestionService>

  /**
   * Maps a globally _monotonic_ ULID (event ID) to the corresponding event's payload.
   */
  private readonly eventBuffer = new Map<ULID, GrpcEventEnvelope>()

  private outputStream: WritableIterable<GrpcEventEnvelope> | undefined
  private isClosed: boolean
  private readonly closeCallbacks: (() => void)[] = []

  private readonly converter: GrpcEventConverter

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

    this.converter = new GrpcEventConverter(this.garden, this.log)

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
      this.log.silly("GrpcEventStream: Starting loop")

      while (!this.isClosed) {
        this.log.silly("GrpcEventStream: Connecting ...")

        try {
          await this.streamEvents()
        } catch (err) {
          if (err instanceof ConnectError) {
            this.log.silly(`GrpcEventStream: Error while streaming events: ${err}`)
            this.log.silly("GrpcEventStream: Retrying in 1 second...")
            await sleep(1000)
          } else {
            // This is a temporary workaround to avoid crashing the process when the new event system is not in production.
            // In production, we want to crash the process to surface the issue.
            this.log.debug(`GrpcEventStream: Unexpected error while streaming events: ${err}`)
            this.log.debug("GrpcEventStream: Bailing out.")
            break
            // TODO(production): remove the code above and uncomment the following.
            // This will become an unhandled error and will cause the process to crash.
            // throw err
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
      this.log.silly("GrpcEventStream: Close called and no events waiting for acknowledgement. Disconnecting...")
      this.isClosed = true
      // close the connection as well
      this.outputStream?.close()
      return
    }

    // there are still events in the buffer, we need to wait for them to be acknowledged
    const promise = new Promise<void>((resolve) => {
      this.closeCallbacks.push(resolve)
    })

    // TODO(production): use 30 seconds when we go to production, but for now let's only wait 100ms for acknowledgements.
    const timeout = 100
    // wait max 10 seconds for the events to be acknowledged
    // const timeout = 30000

    await Promise.race([
      promise,
      (async () => {
        await sleep(timeout)
        // TODO(production): use warn loglevel instead of debug for this one
        this.log.debug(
          `Not all events were acknowledged within ${timeout / 1000} seconds. Information in Garden Cloud may be incomplete.`
        )
      })(),
    ])

    this.isClosed = true
    this.outputStream?.close()
  }

  private handleEvent<T extends EventName>(name: T, payload: EventPayload<T>) {
    const events = this.converter.convert(name, payload)
    for (const envelope of events) {
      this.log.silly(
        () => `GrpcEventStream: ${this.outputStream ? "Sending" : "Buffering"} event ${describeGrpcEvent(envelope)}`
      )

      this.eventBuffer.set(envelope.eventUlid, envelope)

      // NOTE: we don't need to wait for the promise to resolve.
      // If sending the event fails, it will be retried as it lives in the event buffer.
      // See the caller of `streamEvents`.
      void this.outputStream?.write(envelope).catch((_) => undefined)
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
    this.outputStream = createWritableIterable<GrpcEventEnvelope>()

    const ackStream = this.eventIngestionService.ingestEvents(this.outputStream)

    this.log.silly(() => "GrpcEventStream: Connected")

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
        this.log.silly(
          `GrpcEventStream: Server failed to process event with ulid=${nextAck.eventUlid}, final=${nextAck.final}: ${JSON.stringify(this.eventBuffer.get(nextAck.eventUlid), (_, v) => (typeof v === "bigint" ? v.toString() : v))}`
        )
      } else {
        this.log.silly(() => `GrpcEventStream: Received ack for event ${nextAck.eventUlid}, final=${nextAck.final}`)
      }

      // Remove acknowledged event from the buffer
      if (nextAck.success || nextAck.final) {
        this.eventBuffer.delete(nextAck.eventUlid)
      }

      const messages = nextAck.messages || []
      for (const msg of messages) {
        const logMessage = `${this.garden.cloudApiV2.distroName} failed to process event ulid=${nextAck.eventUlid}: ${msg.text}`

        switch (msg.severity) {
          case EventResponse_Message_Severity.DEBUG:
            this.log.debug(logMessage)
            break
          case EventResponse_Message_Severity.INFO:
            this.log.info(logMessage)
            break
          case EventResponse_Message_Severity.WARNING:
            this.log.warn(logMessage)
            break
          case EventResponse_Message_Severity.ERROR:
            throw new GrowCloudError({
              message: logMessage,
            })
          default:
            msg.severity satisfies never
            this.log.silly(`GrpcEventStream: Unknown message severity ${msg.severity}: ${msg.text}`)
        }
      }

      if (this.closeCallbacks.length && this.eventBuffer.size === 0) {
        this.log.silly("GrpcEventStream: All events have been acknowledged. Disconnecting...")
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

    this.log.silly(() => `GrpcEventStream: Flushing ${this.eventBuffer.size} events from the buffer`)
    // NOTE: The Map implementation in the javascript runtime guarantees that values will be iterated in the order they were added (FIFO).
    for (const event of this.eventBuffer.values()) {
      if (!this.outputStream) {
        this.log.silly(() => `GrpcEventStream: Stream closed during flush`)
        break
      }
      // NOTE: we're not waiting for the promise to resolve on purpose, as we want to synchronously flush all events
      // to the underlying queue avoiding out-of-order event transmission.
      void this.outputStream.write(event).catch((_) => undefined)
    }
  }
}
