/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { monotonicFactory } from "ulid"
import type { GardenWithNewBackend } from "../../garden.js"
import { registerCleanupFunction } from "../../util/util.js"
import type { Log } from "../../logger/log-entry.js"
import type { EventName, Events, GardenEventAnyListener } from "../../events/events.js"
import { LogLevel } from "../../logger/logger.js"
import type { LogEntryEventPayload } from "../buffered-event-stream.js"
import type {
  Event as GrpcEvent,
  GardenEventIngestionService,
} from "@buf/garden_grow-platform.bufbuild_es/private/events/events_pb.js"
import { EventContextSchema, EventSchema } from "@buf/garden_grow-platform.bufbuild_es/private/events/events_pb.js"
import { create } from "@bufbuild/protobuf"
import type { Client } from "@connectrpc/connect"
import type { WritableIterable } from "@connectrpc/connect/protocol"
import { createWritableIterable } from "@connectrpc/connect/protocol"

const nextEventUlid = monotonicFactory()

export class GrowBufferedEventStream {
  private readonly garden: GardenWithNewBackend
  private readonly log: Log

  private readonly eventListener: GardenEventAnyListener<EventName>
  private readonly logListener: GardenEventAnyListener<"logEntry">

  // TODO: add sessionUlid to Garden and make it non-optional in GardenWithNewBackend types
  private readonly sessionUlid: string

  private readonly client: Client<typeof GardenEventIngestionService>

  /**
   * Maps a globally _monotonic_ ULID (event ID) to the corresponding event's payload.
   */
  private readonly eventBuffer = new Map<string, GrpcEvent>()

  private outputStream: WritableIterable<GrpcEvent> | undefined
  private closed: boolean

  constructor({
    garden,
    log,
    sessionUlid,
    client,
  }: {
    garden: GardenWithNewBackend
    log: Log
    sessionUlid: string
    client: Client<typeof GardenEventIngestionService>
  }) {
    this.garden = garden
    this.log = log
    this.sessionUlid = sessionUlid
    this.client = client
    this.closed = false

    // TODO: make sure it waits for the callback function completion
    registerCleanupFunction("grow-stream-session-cancelled-event", () => {
      if (this.closed) {
        return
      }

      void this.handleEvent("sessionCancelled", {})
      this.close().catch(() => {})
    })

    this.logListener = (name, payload) => {
      if (name === "logEntry" && payload.level <= LogLevel.debug) {
        this.handleLogEntry(payload)
      }
    }
    this.log.root.events.onAny(this.logListener)

    this.eventListener = async (name, payload) => {
      await this.handleEvent(name, payload)
    }
    this.garden.events.onAny(this.eventListener)

    this.log.silly(() => "BufferedEventStream: Connected")
  }

  async close() {
    if (this.closed) {
      return
    }

    this.garden.events.offAny(this.eventListener)
    this.log.root.events.offAny(this.logListener)

    this.closed = true

    try {
      // TODO: flush the data
      // await this.flushAll()
      // this.log.debug("Done flushing all events and log entries.")
    } catch (err) {
      /**
       * We don't throw an exception here, since a failure to stream events and log entries doesn't mean that the
       * command failed.
       */
      this.log.error(`Error while flushing events and log entries: ${err}`)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async handleEvent<T extends EventName>(name: T, payload: Events[T]) {
    const event: GrpcEvent = create(EventSchema, {
      eventId: nextEventUlid(),
      context: create(EventContextSchema, {
        organizationId: this.garden.cloudApiV2.organizationId,
        sessionId: this.sessionUlid,
      }),
    })

    this.eventBuffer.set(event.eventId, event)
    await this.outputStream?.write(event)
  }

  async streamEvents() {
    this.outputStream = createWritableIterable<GrpcEvent>()
    // this.eventBuffer.values(async (e) => this.outputStream?.write(e))

    try {
      const ackStream = this.client.ingestEventStream(this.outputStream)
      for await (const nextAck of ackStream) {
        if (!nextAck.success) {
          this.log.debug(`Server failed to process event with ulid=${nextAck.eventId}`)
        }

        this.eventBuffer.delete(nextAck.eventId)
      }
    } finally {
      this.outputStream.close()
      this.outputStream = undefined
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  handleLogEntry(logEntry: LogEntryEventPayload) {
    // TODO: logs handling
  }
}
