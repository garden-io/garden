/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"

import { getLogger, LogLevel, Logger } from "../../../../src/logger/logger"
import { freezeTime } from "../../../helpers"
import { LogEntryMetadata } from "../../../../src/logger/log-entry"
import { omit } from "lodash"

const logger: Logger = getLogger()

beforeEach(() => {
  logger["entries"] = []
})

describe("Log", () => {
  const log = logger.makeNewLogContext()
  it("should create log entries with the appropriate fields set", () => {
    const timestamp = freezeTime().toISOString()
    const entry = log
      .info({
        id: "my-id",
        msg: "hello",
        section: "80",
        symbol: "info",
        data: { foo: "bar" },
        dataFormat: "json",
        metadata: {
          workflowStep: {
            index: 2,
          },
        },
      })
      .getLatestEntry()

    expect(entry.metadata).to.eql({
      workflowStep: {
        index: 2,
      },
    })
    expect(entry.root).to.exist
    const partialEntry = omit(entry, "root", "metadata")

    expect(partialEntry).to.eql({
      type: "logEntry",
      msg: "hello",
      section: "80",
      symbol: "info",
      data: { foo: "bar" },
      dataFormat: "json",
      timestamp,
      key: entry.key,
      id: "my-id",
      level: LogLevel.info,
      error: undefined,
    })
  })
  context("metadata", () => {
    const metadata: LogEntryMetadata = { workflowStep: { index: 1 } }
    it("should pass on any metadata to child logs", () => {
      const log1 = logger.makeNewLogContext({ metadata })
      const log2 = log1.makeNewLogContext({})
      const log3 = log2.makeNewLogContext({})
      const log4 = log3.makeNewLogContext({ metadata })
      expect(log1.metadata).to.eql(metadata)
      expect(log2.metadata).to.eql(metadata)
      expect(log3.metadata).to.eql(metadata)
      expect(log4.metadata).to.eql(metadata)
    })
    it("should not set empty metadata objects on child entries", () => {
      const log = logger.makeNewLogContext()
      const childLog = log.makeNewLogContext({})
      expect(log.metadata).to.eql(undefined)
      expect(childLog.metadata).to.eql(undefined)
    })
  })
  context("fixLevel=true", () => {
    it("should create a log whose child logs and entries inherit the level", () => {
      const logVerbose = logger.makeNewLogContext({ fixLevel: true, level: LogLevel.verbose })
      const verboseEntryInfo = logVerbose.info("").getLatestEntry()
      const verboseEntryError = logVerbose.error("").getLatestEntry()
      const verboseEntrySilly = logVerbose.silly("").getLatestEntry()
      const childLog = logVerbose.makeNewLogContext({})
      const childEntryInfo = childLog.info("").getLatestEntry()
      const childEntryError = childLog.error("").getLatestEntry()
      const childEntrySilly = childLog.silly("").getLatestEntry()

      expect(logVerbose.level).to.eql(LogLevel.verbose)
      expect(verboseEntryInfo.level).to.eql(LogLevel.verbose)
      expect(verboseEntryError.level).to.eql(LogLevel.verbose)
      expect(verboseEntrySilly.level).to.eql(LogLevel.silly)

      expect(childLog.level).to.eql(LogLevel.verbose)
      expect(childEntryInfo.level).to.eql(LogLevel.verbose)
      expect(childEntryError.level).to.eql(LogLevel.verbose)
      expect(childEntrySilly.level).to.eql(LogLevel.silly)
    })
  })
})
