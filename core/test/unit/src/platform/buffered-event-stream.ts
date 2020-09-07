/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { StreamEvent, LogEntryEvent, BufferedEventStream } from "../../../../src/enterprise/buffered-event-stream"
import { getLogger } from "../../../../src/logger/logger"
import { Garden } from "../../../../src/garden"
import { makeTestGardenA } from "../../../helpers"
import { find, isMatch } from "lodash"

describe("BufferedEventStream", () => {
  const getConnectionParams = (garden: Garden) => ({
    garden,
    targets: [
      {
        host: "dummy-platform_url",
        clientAuthToken: "dummy-client-token",
      },
    ],
  })

  it("should flush events and log entries emitted by a connected event emitter", async () => {
    const flushedEvents: StreamEvent[] = []
    const flushedLogEntries: LogEntryEvent[] = []

    const log = getLogger().placeholder()

    const bufferedEventStream = new BufferedEventStream(log, "dummy-session-id")

    bufferedEventStream["flushEvents"] = (events: StreamEvent[]) => {
      flushedEvents.push(...events)
      return Promise.resolve()
    }
    bufferedEventStream["flushLogEntries"] = (logEntries: LogEntryEvent[]) => {
      flushedLogEntries.push(...logEntries)
      return Promise.resolve()
    }

    const garden = await makeTestGardenA()
    bufferedEventStream.connect(getConnectionParams(garden))

    garden.events.emit("_test", "event")
    log.root.events.emit("_test", "log")

    await bufferedEventStream.flushAll()

    expect(find(flushedEvents, (e) => isMatch(e, { name: "_test", payload: "event" }))).to.exist
    expect(flushedLogEntries).to.include("log")
  })

  it("should only flush events or log entries emitted by the last connected Garden bus", async () => {
    const flushedEvents: StreamEvent[] = []
    const flushedLogEntries: LogEntryEvent[] = []

    const log = getLogger().placeholder()

    const bufferedEventStream = new BufferedEventStream(log, "dummy-session-id")

    bufferedEventStream["flushEvents"] = (events: StreamEvent[]) => {
      flushedEvents.push(...events)
      return Promise.resolve()
    }
    bufferedEventStream["flushLogEntries"] = (logEntries: LogEntryEvent[]) => {
      flushedLogEntries.push(...logEntries)
      return Promise.resolve()
    }

    const gardenA = await makeTestGardenA()
    const gardenB = await makeTestGardenA()

    bufferedEventStream.connect(getConnectionParams(gardenA))
    bufferedEventStream.connect(getConnectionParams(gardenB))

    log.root.events.emit("_test", "log")
    gardenA.events.emit("_test", "event")

    await bufferedEventStream.flushAll()

    expect(flushedEvents.length).to.eql(0)
    expect(flushedLogEntries).to.include("log")

    gardenB.events.emit("_test", "event")
    await bufferedEventStream.flushAll()

    expect(find(flushedEvents, (e) => isMatch(e, { name: "_test", payload: "event" }))).to.exist
  })
})
