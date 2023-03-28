/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"

import { getRootLogger, LogLevel, Logger } from "../../../../src/logger/logger"
import { freezeTime } from "../../../helpers"
import { createActionLog, Log, LogMetadata } from "../../../../src/logger/log-entry"
import { omit } from "lodash"
import chalk from "chalk"

const logger: Logger = getRootLogger()

beforeEach(() => {
  logger["entries"] = []
})

describe("Log", () => {
  let log: Log
  beforeEach(() => {
    log = logger.createLog()
  })

  describe("silly", () => {
    it("should log an entry with the silly level", () => {
      const entry = log.silly("silly").getLatestEntry()
      expect(entry.level).to.eql(LogLevel.silly)
    })
  })
  describe("debug", () => {
    it("should log an entry with the debug level", () => {
      const entry = log.debug("debug").getLatestEntry()
      expect(entry.level).to.eql(LogLevel.debug)
    })
  })
  describe("verbose", () => {
    it("should log an entry with the verbose level", () => {
      const entry = log.verbose("verbose").getLatestEntry()
      expect(entry.level).to.eql(LogLevel.verbose)
    })
  })
  describe("warn", () => {
    it("should log an entry with the warn level", () => {
      const entry = log.warn("warn").getLatestEntry()
      expect(entry.level).to.eql(LogLevel.warn)
    })
  })
  describe("error", () => {
    it("should log an entry with the error level", () => {
      const entry = log.error("error").getLatestEntry()
      expect(entry.level).to.eql(LogLevel.error)
    })
    it("should color the message red", () => {
      const entry = log.error("error").getLatestEntry()
      expect(entry.msg).to.eql(chalk.red("error"))
    })
    it("should print the duration if showDuration=true", () => {
      const errorLog = log.createLog({ name: "test-log", showDuration: true })
      const entry = errorLog.error("error").getLatestEntry()
      expect(entry.msg).to.include("(in ")
    })
  })
  describe("success", () => {
    it("should log success message", () => {
      const entry = log.success("success").getLatestEntry()
      expect(entry.level).to.eql(LogLevel.info)
      expect(entry.msg).to.eql(chalk.green("success"))
    })
    it("should print the duration if showDuration=true", () => {
      const successLog = log.createLog({ name: "success-log", showDuration: true })
      const entry = successLog.success("success").getLatestEntry()
      expect(entry.msg).to.include("(in ")
    })
  })
  describe("general logging", () => {
    context("metadata", () => {
      const metadata: LogMetadata = { workflowStep: { index: 1 } }
      it("should pass on any metadata to child logs", () => {
        const log1 = logger.createLog({ metadata })
        const log2 = log1.createLog({})
        const log3 = log2.createLog({})
        const log4 = log3.createLog({ metadata })
        expect(log1.metadata).to.eql(metadata)
        expect(log2.metadata).to.eql(metadata)
        expect(log3.metadata).to.eql(metadata)
        expect(log4.metadata).to.eql(metadata)
      })
      it("should not set empty metadata objects on child entries", () => {
        const log = logger.createLog()
        const childLog = log.createLog({})
        expect(log.metadata).to.eql(undefined)
        expect(childLog.metadata).to.eql(undefined)
      })
    })
    context("fixLevel=verbose", () => {
      it("should create a log whose child logs and entries inherit the level", () => {
        const logVerbose = logger.createLog({ fixLevel: LogLevel.verbose })
        const verboseEntryInfo = logVerbose.info("").getLatestEntry()
        const verboseEntryError = logVerbose.error("").getLatestEntry()
        const verboseEntrySilly = logVerbose.silly("").getLatestEntry()
        const childLog = logVerbose.createLog({})
        const childEntryInfo = childLog.info("").getLatestEntry()
        const childEntryError = childLog.error("").getLatestEntry()
        const childEntrySilly = childLog.silly("").getLatestEntry()

        expect(logVerbose.fixLevel).to.eql(LogLevel.verbose)
        expect(verboseEntryInfo.level).to.eql(LogLevel.verbose)
        expect(verboseEntryError.level).to.eql(LogLevel.verbose)
        expect(verboseEntrySilly.level).to.eql(LogLevel.silly)

        expect(childLog.fixLevel).to.eql(LogLevel.verbose)
        expect(childEntryInfo.level).to.eql(LogLevel.verbose)
        expect(childEntryError.level).to.eql(LogLevel.verbose)
        expect(childEntrySilly.level).to.eql(LogLevel.silly)
      })
    })
  })
})

describe("CoreLog", () => {
  let log: Log
  beforeEach(() => {
    log = logger.createLog()
  })

  describe("createLog", () => {
    it("should create a new CoreLog context, optionally overwriting some fields", () => {
      const timestamp = freezeTime().toISOString()
      const testLog = log.createLog({ name: "test-log" })
      const partialTestLog = omit(testLog, "root")

      expect(testLog.root).to.exist
      expect(partialTestLog).to.eql({
        type: "coreLog",
        entries: [],
        key: testLog.key,
        metadata: undefined,
        origin: undefined,
        fixLevel: undefined,
        section: undefined,
        showDuration: false,
        timestamp,
        context: {
          name: "test-log",
        },
        parentConfigs: [
          {
            context: log.context,
            metadata: log.metadata,
            timestamp: log.timestamp,
            key: log.key,
            section: log.section,
            fixLevel: log.fixLevel,
            type: "coreLog",
          },
        ],
      })

      const testLogChild = testLog.createLog({})
      const partialTestLogChild = omit(testLogChild, "root")
      expect(partialTestLogChild).to.eql({
        type: "coreLog",
        entries: [],
        key: testLogChild.key,
        metadata: undefined,
        origin: undefined,
        fixLevel: undefined,
        section: undefined,
        showDuration: false,
        timestamp,
        context: {
          name: "test-log", // <--- Inherits context
        },
        parentConfigs: [log.getConfig(), testLog.getConfig()],
      })

      const testLogChildWithOverwrites = testLog.createLog({
        name: "test-log-overwrites",
        fixLevel: LogLevel.warn,
        metadata: { workflowStep: { index: 2 } },
      })
      const partialTestLogChildWithOverwrites = omit(testLogChildWithOverwrites, "root")
      expect(partialTestLogChildWithOverwrites).to.eql({
        type: "coreLog",
        entries: [],
        key: testLogChildWithOverwrites.key,
        metadata: { workflowStep: { index: 2 } },
        origin: undefined,
        fixLevel: LogLevel.warn,
        section: undefined,
        showDuration: false,
        timestamp,
        context: {
          name: "test-log-overwrites", // <--- Overwrites context
        },
        parentConfigs: [log.getConfig(), testLog.getConfig()],
      })
    })
    it("should create a new log context and have it inherit the metadata", () => {
      const testLog = log.createLog({ name: "test-log", metadata: { workflowStep: { index: 2 } } })
      const childLog = testLog.createLog({})

      expect(testLog.metadata).to.eql({ workflowStep: { index: 2 } })
      expect(childLog.metadata).to.eql({ workflowStep: { index: 2 } })
    })
  })
  describe("createLogEntry", () => {
    it("should pass its config on to the log entry", () => {
      const timestamp = freezeTime().toISOString()
      const testLog = log.createLog({ name: "test-log", origin: "foo", metadata: { workflowStep: { index: 2 } } })
      const entry = testLog.info("hello").getLatestEntry()

      expect(entry.key).to.be.a.string
      expect(entry).to.eql({
        key: entry.key,
        level: LogLevel.info,
        metadata: {
          workflowStep: {
            index: 2,
          },
        },
        msg: "hello",
        origin: "foo",
        parentLogKey: testLog.key,
        section: undefined,
        timestamp,
        type: "coreLogEntry",
        context: {
          name: "test-log",
        },
      })
    })
  })
})

describe("ActionLog", () => {
  let log: Log
  beforeEach(() => {
    log = logger.createLog()
  })

  describe("createActionLog helper", () => {
    it("should create a new ActionLog context, optionally overwriting some fields", () => {
      const timestamp = freezeTime().toISOString()
      const testLog = createActionLog({ log, actionName: "api", actionKind: "build" })
      const partialTestLog = omit(testLog, "root")

      expect(testLog.root).to.exist
      expect(partialTestLog).to.eql({
        type: "actionLog",
        entries: [],
        key: testLog.key,
        metadata: undefined,
        origin: undefined,
        fixLevel: undefined,
        section: undefined,
        showDuration: true, // <--- Always true for ActionLog
        timestamp,
        context: {
          actionName: "api",
          actionKind: "build",
        },
        parentConfigs: [
          {
            context: log.context,
            metadata: log.metadata,
            timestamp: log.timestamp,
            key: log.key,
            section: log.section,
            fixLevel: log.fixLevel,
            type: "coreLog",
          },
        ],
      })

      const testLogChild = testLog.createLog({})
      const partialTestLogChild = omit(testLogChild, "root")
      expect(partialTestLogChild).to.eql({
        type: "actionLog",
        entries: [],
        key: testLogChild.key,
        metadata: undefined,
        origin: undefined,
        fixLevel: undefined,
        section: undefined,
        showDuration: true,
        timestamp,
        context: {
          // <--- Inherits context
          actionName: "api",
          actionKind: "build",
        },
        parentConfigs: [log.getConfig(), testLog.getConfig()],
      })
    })
    it("should always show duration", () => {
      const testLog = createActionLog({ log, actionName: "api", actionKind: "build" })
      expect(testLog.showDuration).to.be.true
    })
    it("should create a new log context and have it inherit the metadata", () => {
      const testLog = log.createLog({ name: "test-log", metadata: { workflowStep: { index: 2 } } })
      const childLog = testLog.createLog({})

      expect(testLog.metadata).to.eql({ workflowStep: { index: 2 } })
      expect(childLog.metadata).to.eql({ workflowStep: { index: 2 } })
    })
  })
  describe("createLogEntry", () => {
    it("should pass its config on to the log entry", () => {
      const timestamp = freezeTime().toISOString()
      const testLog = createActionLog({
        log,
        actionKind: "build",
        actionName: "api",
        origin: "foo",
        metadata: { workflowStep: { index: 2 } },
      })
      const entry = testLog.info("hello").getLatestEntry()

      expect(entry.key).to.be.a.string
      expect(entry).to.eql({
        key: entry.key,
        level: LogLevel.info,
        metadata: {
          workflowStep: {
            index: 2,
          },
        },
        msg: "hello",
        origin: "foo",
        parentLogKey: testLog.key,
        section: undefined,
        timestamp,
        type: "actionLogEntry",
        context: {
          actionKind: "build",
          actionName: "api",
        },
      })
    })
  })
})
