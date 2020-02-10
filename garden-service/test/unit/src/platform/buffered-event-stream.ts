/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { StreamEvent, LogEntryEvent, BufferedEventStream } from "../../../../src/cloud/buffered-event-stream"
import { getLogger } from "../../../../src/logger/logger"
import { EventBus } from "../../../../src/events"

describe("BufferedEventStream", () => {
  it("should flush events and log entries emitted by a connected event emitter", async () => {
    const flushedEvents: StreamEvent[] = []
    const flushedLogEntries: LogEntryEvent[] = []

    const log = getLogger().placeholder()

    const bufferedEventStream = new BufferedEventStream(log, "dummy-session-id")

    bufferedEventStream["flushEvents"] = (events: StreamEvent[]) => {
      flushedEvents.push(...events)
    }
    bufferedEventStream["flushLogEntries"] = (logEntries: LogEntryEvent[]) => {
      flushedLogEntries.push(...logEntries)
    }

    const eventBus = new EventBus()
    bufferedEventStream.connect(eventBus, "dummy-client-token", "dummy-platform_url", "myproject")

    eventBus.emit("_test", {})
    log.root.events.emit("_test", {})

    bufferedEventStream.flushBuffered({ flushAll: true })

    expect(flushedEvents.length).to.eql(1)
    expect(flushedLogEntries.length).to.eql(1)
  })

  it("should only flush events or log entries emitted by the last connected event emitter", async () => {
    const flushedEvents: StreamEvent[] = []
    const flushedLogEntries: LogEntryEvent[] = []

    const log = getLogger().placeholder()

    const bufferedEventStream = new BufferedEventStream(log, "dummy-session-id")

    bufferedEventStream["flushEvents"] = (events: StreamEvent[]) => {
      flushedEvents.push(...events)
    }
    bufferedEventStream["flushLogEntries"] = (logEntries: LogEntryEvent[]) => {
      flushedLogEntries.push(...logEntries)
    }

    const oldEventBus = new EventBus()
    bufferedEventStream.connect(oldEventBus, "dummy-client-token", "dummy-platform_url", "myproject")
    const newEventBus = new EventBus()
    bufferedEventStream.connect(newEventBus, "dummy-client-token", "dummy-platform_url", "myproject")

    log.root.events.emit("_test", {})
    oldEventBus.emit("_test", {})

    bufferedEventStream.flushBuffered({ flushAll: true })

    expect(flushedEvents.length).to.eql(0)
    expect(flushedLogEntries.length).to.eql(1)

    newEventBus.emit("_test", {})
    bufferedEventStream.flushBuffered({ flushAll: true })

    expect(flushedEvents.length).to.eql(1)
  })
})
