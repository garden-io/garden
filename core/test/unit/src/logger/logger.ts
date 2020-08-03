/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { omit } from "lodash"

import { LogLevel } from "../../../../src/logger/log-node"
import { getLogger } from "../../../../src/logger/logger"
import { LogEntryEvent, formatLogEntryForEventStream } from "../../../../src/enterprise/buffered-event-stream"

const logger: any = getLogger()

beforeEach(() => {
  logger.children = []
})

describe("Logger", () => {
  describe("events", () => {
    let loggerEvents: LogEntryEvent[] = []
    let listener = (event: LogEntryEvent) => loggerEvents.push(event)

    before(() => logger.events.on("logEntry", listener))
    after(() => logger.events.off("logEntry", listener))

    beforeEach(() => {
      loggerEvents = []
    })

    it("should emit a loggerEvent event when an entry is created", () => {
      const log = logger.info({ msg: "0" })
      const e = loggerEvents[0]
      expect(loggerEvents.length).to.eql(1)
      expect(e.revision).to.eql(0)
      expect(omit(formatLogEntryForEventStream(log), "timestamp")).to.eql(omit(e, "timestamp"))
    })

    it("should emit a loggerEvent with a bumped revision when an entry is updated", () => {
      const log = logger.info({ msg: "0" })
      log.setState("1")
      logger.info({ msg: "0" })
      const [e1, e2, e3] = loggerEvents
      expect(loggerEvents.length).to.eql(3)
      expect(e1.revision).to.eql(0)
      expect(e2.revision).to.eql(1)
      expect(e3.revision).to.eql(0)
    })
  })

  describe("findById", () => {
    it("should return the first log entry with a matching id and undefined otherwise", () => {
      logger.info({ msg: "0" })
      logger.info({ msg: "a1", id: "a" })
      logger.info({ msg: "a2", id: "a" })
      expect(logger.findById("a")["messageStates"][0]["msg"]).to.eql("a1")
      expect(logger.findById("z")).to.be.undefined
    })
  })

  describe("filterBySection", () => {
    it("should return an array of all entries with the matching section name", () => {
      logger.info({ section: "s0" })
      logger.info({ section: "s1", id: "a" })
      logger.info({ section: "s2" })
      logger.info({ section: "s1", id: "b" })
      const s1 = logger.filterBySection("s1")
      const sEmpty = logger.filterBySection("s99")
      expect(s1.map((entry) => entry.id)).to.eql(["a", "b"])
      expect(sEmpty).to.eql([])
    })
  })

  describe("getLogEntries", () => {
    it("should return an ordered list of log entries", () => {
      logger.error("error")
      logger.warn("warn")
      logger.info("info")
      logger.verbose("verbose")
      logger.debug("debug")
      logger.silly("silly")

      const entries = logger.getLogEntries()
      const levels = entries.map((e) => e.level)

      expect(entries).to.have.lengthOf(6)
      expect(levels).to.eql([
        LogLevel.error,
        LogLevel.warn,
        LogLevel.info,
        LogLevel.verbose,
        LogLevel.debug,
        LogLevel.silly,
      ])
    })
  })
})
