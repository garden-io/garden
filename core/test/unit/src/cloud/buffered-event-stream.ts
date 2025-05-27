/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import type { LogEntryEventPayload, StreamEvent } from "../../../../src/cloud/buffered-event-stream.js"
import { BufferedEventStream } from "../../../../src/cloud/buffered-event-stream.js"
import { getRootLogger, LogLevel } from "../../../../src/logger/logger.js"
import { makeTestGardenA } from "../../../helpers.js"
import { find, isMatch, range, repeat } from "lodash-es"
import type { CloudSession, GardenCloudApi } from "../../../../src/cloud/api.js"

function makeDummyRecord(sizeKb: number) {
  return { someKey: repeat("a", sizeKb * 1024) }
}

const mockCloudSession: CloudSession = {
  // this api is never called in the tests below, all caller functions are overridden in the individual tests
  api: {} as GardenCloudApi,
  // we do not need any correct values of these for this test suite
  id: "fake-session-ulid",
  shortId: "fake-short-id",
  projectId: "fake-project-id",
  environmentId: "fake-namespace-id",
  namespaceId: "fake-namespace-id",
}

describe("BufferedEventStream", () => {
  const maxLogLevel = LogLevel.debug

  it("should flush events and log entries emitted by a connected event emitter", async () => {
    const flushedEvents: StreamEvent[] = []
    const flushedLogEntries: LogEntryEventPayload[] = []

    const log = getRootLogger().createLog()

    const garden = await makeTestGardenA()

    const bufferedEventStream = new BufferedEventStream({ log, garden, maxLogLevel, cloudSession: mockCloudSession })

    bufferedEventStream["getTargets"] = () => {
      return [{ enterprise: true }]
    }
    bufferedEventStream["flushEvents"] = (events: StreamEvent[]) => {
      flushedEvents.push(...events)
      return Promise.resolve()
    }
    bufferedEventStream["flushLogEntries"] = (logEntries: LogEntryEventPayload[]) => {
      flushedLogEntries.push(...logEntries)
      return Promise.resolve()
    }

    garden.events.emit("_test", { msg: "event" })
    garden.log.info("foo")

    await bufferedEventStream.flushAll()
    await bufferedEventStream.close()
    garden.close()

    expect(find(flushedEvents, (e) => isMatch(e, { name: "_test", payload: { msg: "event" } }))).to.exist
    expect(flushedLogEntries[0]?.message?.msg).to.equal("foo")
  })

  describe("makeBatch", () => {
    const maxBatchBytes = 3 * 1024 // Set this to a low value (3 Kb) to keep the memory use of the test suite low.
    const recordSizeKb = 0.5

    const targets = [
      {
        host: "dummy-platform_url",
        clientAuthToken: "dummy-client-token",
        enterprise: true,
      },
    ]

    it("should pick records until the batch size reaches MAX_BATCH_BYTES", async () => {
      const log = getRootLogger().createLog()
      const garden = await makeTestGardenA()
      const bufferedEventStream = new BufferedEventStream({
        log,
        garden,
        targets,
        maxLogLevel,
        cloudSession: mockCloudSession,
        maxBatchBytes,
      })
      await bufferedEventStream.close()

      // Total size is ~3MB, which exceeds MAX_BATCH_BYTES
      const records = range(100).map((_) => makeDummyRecord(recordSizeKb))
      const batch = bufferedEventStream.makeBatch(records)
      const batchSize = Buffer.from(JSON.stringify(batch)).length
      expect(batch.length).to.be.lte(records.length)
      expect(batch.length).to.be.lte(maxBatchBytes / (recordSizeKb * 1024))
      expect(batchSize).to.be.lte(maxBatchBytes)
    })

    it("should drop individual records whose payload size exceeds MAX_BATCH_BYTES", async () => {
      const log = getRootLogger().createLog()
      const garden = await makeTestGardenA()
      const bufferedEventStream = new BufferedEventStream({
        log,
        garden,
        targets,
        maxLogLevel,
        cloudSession: mockCloudSession,
        maxBatchBytes,
      })
      await bufferedEventStream.close()

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
