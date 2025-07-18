/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import type { Logger, LoggerInitParams } from "../../../../src/logger/logger.js"
import { getRootLogger, LogLevel, RootLogger } from "../../../../src/logger/logger.js"
import type { LogEntryEventPayload } from "../../../../src/cloud/legacy/restful-event-stream.js"
import { freezeTime } from "../../../helpers.js"
import { QuietWriter } from "../../../../src/logger/writers/quiet-writer.js"
import { ConfigurationError } from "../../../../src/exceptions.js"
import { styles } from "../../../../src/logger/styles.js"
import { gardenEnv } from "../../../../src/constants.js"

const logger: Logger = getRootLogger()

describe("Logger", () => {
  beforeEach(() => {
    logger["entries"] = []
  })

  describe("applyEnvToLoggerConfig", () => {
    const loggerTypeFromEnv = gardenEnv.GARDEN_LOGGER_TYPE
    const loggerConfig: LoggerInitParams = {
      level: LogLevel.info,
      displayWriterType: "default",
    }

    afterEach(() => {
      // Leave the env as we found it.
      gardenEnv.GARDEN_LOGGER_TYPE = loggerTypeFromEnv
    })

    it("should apply logger type from env", async () => {
      gardenEnv.GARDEN_LOGGER_TYPE = "json"
      const updatedConfig = RootLogger.applyEnvToLoggerConfig(loggerConfig)
      expect(updatedConfig.displayWriterType).to.eql("json")
    })

    it("should not apply logger type from env when the --output option is used", async () => {
      gardenEnv.GARDEN_LOGGER_TYPE = "json"
      const updatedConfig = RootLogger.applyEnvToLoggerConfig({
        ...loggerConfig,
        outputRenderer: "json",
        displayWriterType: "quiet",
      })
      expect(updatedConfig.displayWriterType).to.eql("quiet")
    })
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
          error: new ConfigurationError({ message: "hello-error" }),
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
            error: styles.error("hello-error"),
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
