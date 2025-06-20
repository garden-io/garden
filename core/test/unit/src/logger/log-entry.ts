/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"

import type { Logger } from "../../../../src/logger/logger.js"
import { getRootLogger, LogLevel } from "../../../../src/logger/logger.js"
import { freezeTime } from "../../../helpers.js"
import type { CoreLog, Log, LogMetadata } from "../../../../src/logger/log-entry.js"
import { createActionLog } from "../../../../src/logger/log-entry.js"
import { omit } from "lodash-es"
import { styles } from "../../../../src/logger/styles.js"

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
  describe("info", () => {
    it("should log an entry with the info level", () => {
      const entry = log.info("info").getLatestEntry()
      expect(entry.level).to.eql(LogLevel.info)
    })
  })
  describe("warn", () => {
    it("should log an entry with the warn level", () => {
      const entry = log.warn("warn").getLatestEntry()
      expect(entry.level).to.eql(LogLevel.warn)
    })
    it("should set the log symbol to 'warning'", () => {
      const entry = log.warn("warn").getLatestEntry()
      expect(entry.symbol).to.eql("warning")
    })
  })
  describe("error", () => {
    it("should log an entry with the error level", () => {
      const entry = log.error("error").getLatestEntry()
      expect(entry.level).to.eql(LogLevel.error)
    })
    it("should set the log symbol to 'error'", () => {
      const entry = log.error("error").getLatestEntry()
      expect(entry.symbol).to.eql("error")
    })
    it("should print the duration if showDuration=true", () => {
      const errorLog = log.createLog({ name: "test-log", showDuration: true })
      const entry = errorLog.error("error").getLatestEntry()
      expect(entry.msg).to.include("(took ")
    })
  })
  describe("success", () => {
    it("should log success message in green color by default", () => {
      const entry = log.success("success").getLatestEntry()
      expect(entry.level).to.eql(LogLevel.info)
      expect(entry.msg).to.eql(styles.success("success"))
    })
    it("should include ansi color in log success message", () => {
      const entry = log.success(`hello ${styles.highlight("cyan")}`).getLatestEntry()
      expect(entry.msg).to.eql(styles.success(`hello ${styles.highlight("cyan")}`))
    })
    it("should set the symbol to success", () => {
      const entry = log.success("success").getLatestEntry()
      expect(entry.symbol).to.eql("success")
    })
    it("should print the duration if showDuration=true", () => {
      const successLog = log.createLog({ name: "success-log", showDuration: true })
      const entry = successLog.success("success").getLatestEntry()
      expect(entry.msg).to.include("(took ")
    })
  })
  describe("general logging", () => {
    context("metadata", () => {
      const metadata: LogMetadata = { workflowStep: { index: 1 } }
      it("should pass on any metadata to child logs", () => {
        const log1 = logger.createLog({ metadata })
        const log2 = log1.createLog()
        const log3 = log2.createLog()
        const log4 = log3.createLog({ metadata })
        expect(log1.metadata).to.eql(metadata)
        expect(log2.metadata).to.eql(metadata)
        expect(log3.metadata).to.eql(metadata)
        expect(log4.metadata).to.eql(metadata)
      })
      it("should not set empty metadata objects on child entries", () => {
        const parentLog = logger.createLog()
        const childLog = parentLog.createLog()
        expect(parentLog.metadata).to.eql(undefined)
        expect(childLog.metadata).to.eql(undefined)
      })
    })
    context("fixLevel=verbose", () => {
      it("should create a log whose child logs and entries inherit the level", () => {
        const logVerbose = logger.createLog({ fixLevel: LogLevel.verbose })
        const verboseEntryInfo = logVerbose.info("").getLatestEntry()
        const verboseEntryError = logVerbose.error("").getLatestEntry()
        const verboseEntrySilly = logVerbose.silly("").getLatestEntry()
        const childLog = logVerbose.createLog()
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
    it("should create a new CoreLog", () => {
      const timestamp = freezeTime().toISOString()
      const coreLog = log.createLog({
        name: "core-log",
        origin: "origin",
        fixLevel: LogLevel.verbose,
        metadata: { workflowStep: { index: 2 } },
      })
      const partialCoreLog = omit(coreLog, "root")

      expect(coreLog.root).to.exist
      expect(partialCoreLog).to.eql({
        entries: [],
        key: coreLog.key,
        metadata: {
          workflowStep: { index: 2 },
        },
        fixLevel: LogLevel.verbose,
        showDuration: false,
        timestamp,
        context: {
          name: "core-log",
          origin: "origin",
          type: "coreLog",
        },
        parentConfigs: [
          {
            context: log.context,
            metadata: log.metadata,
            timestamp: log.timestamp,
            key: log.key,
            fixLevel: log.fixLevel,
            transformers: log.transformers,
          },
        ],
        transformers: log.transformers,
      })
    })
    it("should ensure child log inherits config", () => {
      const timestamp = freezeTime().toISOString()
      const coreLog = log.createLog({
        name: "core-log",
        origin: "origin",
        fixLevel: LogLevel.verbose,
        metadata: { workflowStep: { index: 2 } },
      })

      const coreLogChild = coreLog.createLog()
      const partialCoreLogChild = omit(coreLogChild, "root")
      expect(partialCoreLogChild).to.eql({
        entries: [],
        key: coreLogChild.key,
        fixLevel: LogLevel.verbose,
        showDuration: false,
        timestamp,
        context: {
          name: "core-log", // <--- Inherits context
          origin: "origin",
          type: "coreLog",
        },
        metadata: { workflowStep: { index: 2 } },
        parentConfigs: [log.getConfig(), coreLog.getConfig()],
        transformers: log.transformers,
      })
    })
    it("should optionally overwrite context", () => {
      const coreLog = log.createLog({ name: "core-log", origin: "foo" }) as CoreLog

      expect(coreLog.context.name).to.eql("core-log")
      expect(coreLog.context.origin).to.eql("foo")

      const coreLogChild = coreLog.createLog({ name: "core-log-2", origin: "foo-2" })

      expect(coreLogChild.context.name).to.eql("core-log-2")
      expect(coreLogChild.context.origin).to.eql("foo-2")
    })
  })
  describe("createLogEntry", () => {
    it("should pass its config on to the log entry", () => {
      const timestamp = freezeTime().toISOString()
      const testLog = log.createLog({
        name: "test-log",
        origin: "foo",
        metadata: { workflowStep: { index: 2 } },
      })
      const entry = testLog.info("hello").getLatestEntry()

      expect(entry.key).to.be.a("string")
      expect(entry).to.eql({
        key: entry.key,
        level: LogLevel.info,
        metadata: {
          workflowStep: {
            index: 2,
          },
        },
        msg: "hello",
        parentLogKey: testLog.key,
        timestamp,
        context: {
          name: "test-log",
          type: "coreLog",
          origin: "foo",
        },
      })
    })
  })
})

describe("ActionLog", () => {
  let log: Log
  const inheritedMetadata = { workflowStep: { index: 2 } }

  beforeEach(() => {
    log = logger.createLog({
      metadata: inheritedMetadata,
    })
  })

  describe("createActionLog helper", () => {
    it("should create a new ActionLog", () => {
      const timestamp = freezeTime().toISOString()
      const actionLog = createActionLog({
        log,
        origin: "origin",
        actionName: "api",
        actionKind: "build",
        fixLevel: LogLevel.verbose,
      })
      const partialActionLog = omit(actionLog, "root")

      expect(actionLog.root).to.exist
      expect(partialActionLog).to.eql({
        entries: [],
        key: actionLog.key,
        metadata: inheritedMetadata,
        fixLevel: LogLevel.verbose,
        showDuration: true,
        timestamp,
        context: {
          actionKind: "build",
          actionName: "api",
          origin: "origin",
          type: "actionLog",
        },
        parentConfigs: [
          {
            context: log.context,
            metadata: log.metadata,
            timestamp: log.timestamp,
            key: log.key,
            fixLevel: log.fixLevel,
            transformers: log.transformers,
          },
        ],
        transformers: log.transformers,
      })
    })

    it("inherits fixLevel from input log if not set", () => {
      const inputLog = log.createLog({
        name: "test-log",
        origin: "foo",
        fixLevel: LogLevel.verbose,
      })
      // Inherits fixLevel from input log
      const actionLogVerbose = createActionLog({
        log: inputLog,
        origin: "origin",
        actionName: "api",
        actionKind: "build",
      })
      expect(actionLogVerbose.fixLevel).to.eql(LogLevel.verbose)
    })

    it("overwrites input log fixLevel if set", () => {
      const inputLog = log.createLog({
        name: "test-log",
        origin: "foo",
        fixLevel: LogLevel.verbose,
      })
      // Overwrites fixLevel that was set on the input log
      const actionLogDebug = createActionLog({
        log: inputLog,
        origin: "origin",
        actionName: "api",
        actionKind: "build",
        fixLevel: LogLevel.debug,
      })
      expect(actionLogDebug.fixLevel).to.eql(LogLevel.debug)
    })

    it("inherits context from input log", () => {
      log.context.sessionId = "foo"
      const actionLog = createActionLog({
        log,
        origin: "origin",
        actionName: "api",
        actionKind: "build",
        fixLevel: LogLevel.verbose,
      })
      expect(actionLog.context.sessionId).to.equal("foo")
    })

    it("should ensure child log inherits config", () => {
      const timestamp = freezeTime().toISOString()
      const actionLog = createActionLog({
        log,
        origin: "origin",
        actionName: "api",
        actionKind: "build",
        fixLevel: LogLevel.verbose,
      })

      const actionLogChild = actionLog.createLog()
      const partialActionLogChild = omit(actionLogChild, "root")
      expect(partialActionLogChild).to.eql({
        entries: [],
        key: actionLogChild.key,
        fixLevel: LogLevel.verbose,
        showDuration: true,
        timestamp,
        context: {
          actionKind: "build", // <--- Inherits context
          actionName: "api",
          origin: "origin",
          type: "actionLog",
        },
        metadata: inheritedMetadata,
        parentConfigs: [log.getConfig(), actionLog.getConfig()],
        transformers: {},
      })
    })
    it("should optionally overwrite origin", () => {
      const actionLog = createActionLog({
        log,
        origin: "origin",
        actionName: "api",
        actionKind: "build",
        fixLevel: LogLevel.verbose,
      })

      const actionLogChild = actionLog.createLog({ origin: "origin-2" })
      expect(actionLogChild.context.origin).to.eql("origin-2")
    })
    it("should always show duration", () => {
      const testLog = createActionLog({ log, actionName: "api", actionKind: "build" })
      expect(testLog.showDuration).to.be.true
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
      })
      const entry = testLog.info("hello").getLatestEntry()

      expect(entry.key).to.be.a("string")
      expect(entry).to.eql({
        key: entry.key,
        level: LogLevel.info,
        metadata: inheritedMetadata,
        msg: "hello",
        parentLogKey: testLog.key,
        timestamp,
        context: {
          type: "actionLog",
          origin: "foo",
          actionKind: "build",
          actionName: "api",
        },
      })
    })
  })
})
