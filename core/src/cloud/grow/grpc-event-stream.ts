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
  Event as GrpcEvent,
  GardenEventIngestionService,
  IngestEventsResponse,
  IngestEventsRequest,
} from "@buf/garden_grow-platform.bufbuild_es/garden/public/events/v1/events_pb.js"
import {
  IngestEventsRequestSchema,
  IngestEventsResponse_Message_Severity,
} from "@buf/garden_grow-platform.bufbuild_es/garden/public/events/v1/events_pb.js"
import { ConnectError, type Client } from "@connectrpc/connect"
import type { WritableIterable } from "@connectrpc/connect/protocol"
import { createWritableIterable } from "@connectrpc/connect/protocol"

import { GrowCloudError } from "./api.js"
import { describeGrpcEvent, GrpcEventConverter } from "./grpc-event-converter.js"
import { create } from "@bufbuild/protobuf"
import { InternalError } from "../../exceptions.js"

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
  private readonly eventBuffer = new Map<ULID, GrpcEvent>()

  private outputStream: WritableIterable<IngestEventsRequest> | undefined
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

    // Wait max 1 second for the events to be acknowledged
    const timeout = 1000
    // TODO(production): use 30 seconds when we go to production, but for now let's only wait 100ms for acknowledgements.
    // const timeout = 30000

    const timeoutSec = timeout / 1000
    await Promise.race([
      promise,
      (async () => {
        this.log.debug(`Waiting for ${timeoutSec} seconds to flush events to Garden Cloud`)
        await sleep(timeout)
        this.log.debug(
          `GrpcEventStream: Not all events were acknowledged within ${timeoutSec} seconds. Information in Garden Cloud may be incomplete.`
        )
        this.log.warn("Not all events have been sent to Garden Cloud. Check the debug logs for more details.")
      })(),
    ])

    this.isClosed = true
    this.outputStream?.close()
  }

  private handleEvent<T extends EventName>(name: T, payload: EventPayload<T>) {
    const events = this.converter.convert(name, payload)
    for (const event of events) {
      this.log.silly(
        () => `GrpcEventStream: ${this.outputStream ? "Sending" : "Buffering"} event ${describeGrpcEvent(event)}`
      )

      // The eventUlid must be set by the converter call above.
      // The field is optional because of the protobuf validation rules.
      if (!event.eventUlid) {
        throw new InternalError({ message: "Event must have a non-empty ulid" })
      }

      this.eventBuffer.set(event.eventUlid, event)

      // NOTE: we don't need to wait for the promise to resolve.
      // If sending the event fails, it will be retried as it lives in the event buffer.
      // See the caller of `streamEvents`.
      void this.outputStream
        ?.write(create(IngestEventsRequestSchema, { event }))
        .catch((err) => this.log.debug(`GrpcEventStream: Failed to write event ${event.eventUlid}: ${err}`))
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
    this.outputStream = createWritableIterable<IngestEventsRequest>()

    let ackStream: AsyncIterable<IngestEventsResponse>
    try {
      ackStream = this.eventIngestionService.ingestEvents(this.outputStream)
    } catch (err) {
      this.log.debug(`GrpcEventStream: Failed to start event ingestion bi-directional stream: ${err}`)
      throw err
    }

    this.log.silly(() => "GrpcEventStream: Connected")

    this.flushEventBuffer()

    try {
      await this.consumeAcks(ackStream)
    } catch (err) {
      this.log.debug(`GrpcEventStream: Error while consuming acks: ${err}`)
      // Let the outer retry handle this
      throw err
    } finally {
      this.outputStream?.close()
      this.outputStream = undefined
    }
  }

  private async consumeAcks(ackStream: AsyncIterable<IngestEventsResponse>) {
    for await (const nextAck of ackStream) {
      if (!nextAck.success) {
        this.log.debug(
          `GrpcEventStream: Server failed to process event ulid=${nextAck.eventUlid}, final=${nextAck.final}: ` +
            `${JSON.stringify(this.eventBuffer.get(nextAck.eventUlid), (_, v) =>
              typeof v === "bigint" ? v.toString() : v
            )}`
        )
      } else {
        this.log.debug(() => `GrpcEventStream: Received ack for event ${nextAck.eventUlid}, final=${nextAck.final}`)
      }

      // Remove acknowledged event from the buffer
      if (nextAck.success || nextAck.final) {
        this.eventBuffer.delete(nextAck.eventUlid)
      }

      const messages = nextAck.messages || []
      for (const msg of messages) {
        const logMessage = `${this.garden.cloudApiV2.distroName} failed to process event ulid=${nextAck.eventUlid}: ${msg.text}`

        switch (msg.severity) {
          case IngestEventsResponse_Message_Severity.DEBUG:
            this.log.debug(logMessage)
            break
          case IngestEventsResponse_Message_Severity.INFO:
            this.log.info(logMessage)
            break
          case IngestEventsResponse_Message_Severity.WARNING:
            this.log.warn(logMessage)
            break
          case IngestEventsResponse_Message_Severity.ERROR:
            throw new GrowCloudError({
              message: logMessage,
            })
          case IngestEventsResponse_Message_Severity.UNSPECIFIED:
            this.log.debug(
              `GrpcEventStream: Unspecified message severity for event ulid=${nextAck.eventUlid}: ${msg.text}`
            )
            break
          default:
            msg.severity satisfies never
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

    this.log.debug(() => `GrpcEventStream: Flushing ${this.eventBuffer.size} events from the buffer`)

    // NOTE: The Map implementation in the javascript runtime guarantees that values will be iterated in the order they were added (FIFO).
    for (const event of this.eventBuffer.values()) {
      if (!this.outputStream) {
        this.log.silly(() => `GrpcEventStream: Stream closed during flush`)
        break
      }

      // NOTE: We ignore the promise on purpose to avoid out-of-order events.
      void this.outputStream.write(create(IngestEventsRequestSchema, { event })).catch((err) => {
        this.log.debug(`GrpcEventStream: Failed to write event ${event.eventUlid} during flush: ${err}`)
      })
    }
  }
}
