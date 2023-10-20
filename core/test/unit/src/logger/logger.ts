/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { getRootLogger, Logger, LogLevel, RootLogger } from "../../../../src/logger/logger"
import { LogEntryEventPayload } from "../../../../src/cloud/buffered-event-stream"
import { freezeTime } from "../../../helpers"
import { QuietWriter } from "../../../../src/logger/writers/quiet-writer"

const logger: Logger = getRootLogger()

describe("Logger", () => {
  beforeEach(() => {
    logger["entries"] = []
  })

  describe("events", () => {
    let logWriterEvents: LogEntryEventPayload[] = []
    const listener = (event: LogEntryEventPayload) => logWriterEvents.push(event)

    before(() => logger.events.on("logEntry", listener))
    after(() => logger.events.off("logEntry", listener))

    beforeEach(() => {
      logWriterEvents = []
    })

    describe("log", () => {
      it("should emit a loggerEvent event when an entry is created", () => {
        const now = freezeTime()
        const log = logger.createLog({ name: "log-context-name" })
        log.info({
          msg: "hello",
          rawMsg: "hello-browser",
          symbol: "success",
          data: { foo: "bar" },
          dataFormat: "json",
          metadata: {
            workflowStep: {
              index: 2,
            },
          },
        })
        const e = logWriterEvents[0]
        expect(logWriterEvents.length).to.eql(1)
        expect(e).to.eql({
          $context: {},
          key: e.key,
          timestamp: now.toISOString(),
          level: 2,
          message: {
            msg: "hello",
            rawMsg: "hello-browser",
            section: "log-context-name",
            symbol: "success",
            dataFormat: "json",
            data: { foo: "bar" },
          },
          context: {
            name: "log-context-name",
            origin: undefined,
            type: "coreLog",
          },
          metadata: {
            workflowStep: {
              index: 2,
            },
          },
        })
      })
    })
  })
  describe("log", () => {
    it("should collect entries if storeEntries=true", () => {
      const log = logger.createLog()
      log.error("error")
      log.warn("warn")
      log.info("info")
      log.verbose("verbose")
      log.debug("debug")
      log.silly("silly")

      const entries = logger.getLogEntries()
      expect(entries).to.have.lengthOf(6)
      const messages = entries.map((e) => e.msg)
      expect(messages).to.eql(["error", "warn", "info", "verbose", "debug", "silly"])
    })
    it("should not store entries if storeEntries=false", () => {
      const logWriterB = RootLogger._createInstanceForTests({
        level: LogLevel.info,
        writers: {
          display: new QuietWriter({ level: LogLevel.info }),
          file: [],
        },
        storeEntries: false,
      })
      const log = logWriterB.createLog()

      log.error("error")
      log.warn("warn")
      log.verbose("verbose")
      log.debug("debug")
      log.silly("silly")

      expect(logger.getLogEntries()).to.eql([])
    })
  })
  describe("getLogEntries", () => {
    it("should return the list of log entries", () => {
      const log = logger.createLog()
      log.error("error")
      log.warn("warn")
      log.info("info")
      log.verbose("verbose")
      log.debug("debug")
      log.silly("silly")

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
