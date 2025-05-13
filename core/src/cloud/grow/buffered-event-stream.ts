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

const ulid = monotonicFactory()

export class GrowBufferedEventStream {
  private readonly garden: GardenWithNewBackend
  private readonly log: Log

  private readonly eventListener: GardenEventAnyListener<EventName>
  private readonly logListener: GardenEventAnyListener<"logEntry">

  private closed: boolean

  constructor({ garden, log }: { garden: GardenWithNewBackend; log: Log }) {
    this.garden = garden
    this.log = log
    this.closed = false

    registerCleanupFunction("grow-stream-session-cancelled-event", () => {
      if (this.closed) {
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

    this.eventListener = (name, payload) => {
      this.handleEvent(name, payload)
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
  handleEvent<T extends EventName>(name: T, payload: Events[T]) {
    // TODO: event handling
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  handleLogEntry(logEntry: LogEntryEventPayload) {
    // TODO: logs handling
  }
}
