/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import {
  StreamEvent,
  LogEntryEventPayload,
  BufferedEventStream,
} from "../../../../src/enterprise/buffered-event-stream"
import { getLogger } from "../../../../src/logger/logger"
import { Garden } from "../../../../src/garden"
import { makeTestGardenA } from "../../../helpers"
import { find, isMatch, range, repeat } from "lodash"

function makeDummyRecord(sizeKb: number) {
  return { someKey: repeat("a", sizeKb * 1024) }
}

describe("BufferedEventStream", () => {
  const getConnectionParams = (garden: Garden) => ({
    garden,
    streamEvents: true,
    streamLogEntries: true,
    targets: [
      {
        host: "dummy-platform_url",
        clientAuthToken: "dummy-client-token",
        enterprise: true,
      },
    ],
  })

  it("should flush events and log entries emitted by a connected event emitter", async () => {
    const flushedEvents: StreamEvent[] = []
    const flushedLogEntries: LogEntryEventPayload[] = []

    const log = getLogger().placeholder()

    const bufferedEventStream = new BufferedEventStream({ log, sessionId: "dummy-session-id" })

    bufferedEventStream["flushEvents"] = (events: StreamEvent[]) => {
      flushedEvents.push(...events)
      return Promise.resolve()
    }
    bufferedEventStream["flushLogEntries"] = (logEntries: LogEntryEventPayload[]) => {
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
    const flushedLogEntries: LogEntryEventPayload[] = []

    const log = getLogger().placeholder()

    const bufferedEventStream = new BufferedEventStream({ log, sessionId: "dummy-session-id" })

    bufferedEventStream["flushEvents"] = (events: StreamEvent[]) => {
      flushedEvents.push(...events)
      return Promise.resolve()
    }
    bufferedEventStream["flushLogEntries"] = (logEntries: LogEntryEventPayload[]) => {
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

  describe("makeBatch", () => {
    const maxBatchBytes = 3 * 1024 // Set this to a low value (3 Kb) to keep the memory use of the test suite low.
    it("should pick records until the batch size reaches MAX_BATCH_BYTES", async () => {
      const recordSizeKb = 0.5
      const log = getLogger().placeholder()
      const bufferedEventStream = new BufferedEventStream({ log, sessionId: "dummy-session-id" })
      bufferedEventStream["maxBatchBytes"] = maxBatchBytes
      // Total size is ~3MB, which exceeds MAX_BATCH_BYTES
      const records = range(100).map((_) => makeDummyRecord(recordSizeKb))
      const batch = bufferedEventStream.makeBatch(records)
      const batchSize = Buffer.from(JSON.stringify(batch)).length
      expect(batch.length).to.be.lte(records.length)
      expect(batch.length).to.be.lte(maxBatchBytes / (recordSizeKb * 1024))
      expect(batchSize).to.be.lte(maxBatchBytes)
    })

    it("should drop individual records whose payload size exceeds MAX_BATCH_BYTES", async () => {
      const recordSizeKb = 0.5
      const log = getLogger().placeholder()
      const bufferedEventStream = new BufferedEventStream({ log, sessionId: "dummy-session-id" })
      bufferedEventStream["maxBatchBytes"] = maxBatchBytes
      // This record's size, exceeds MAX_BATCH_BYTES, so it should be dropped by `makeBatch`.
      const tooLarge = {
        ...makeDummyRecord(maxBatchBytes / 1024 + 3),
        tag: "tooLarge",
      }
      const records = [tooLarge, ...range(100).map((_) => makeDummyRecord(recordSizeKb))]
      const batch = bufferedEventStream.makeBatch(records)
      const batchSize = Buffer.from(JSON.stringify(batch)).length

      expect(batch.find((r) => r["tag"] === "tooLarge")).to.be.undefined // We expect `tooLarge` to have been dropped.
      expect(batch.length).to.be.gte(3)
      expect(batch.length).to.be.lte(records.length)
      expect(batch.length).to.be.lte(maxBatchBytes / (recordSizeKb * 1024))
      expect(batchSize).to.be.lte(maxBatchBytes)
    })
  })
})
