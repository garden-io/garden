/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"

import type { Logger } from "../../../../src/logger/logger.js"
import { getRootLogger } from "../../../../src/logger/logger.js"
import {
  renderMsg,
  formatForTerminal,
  renderError,
  formatForJson,
  SECTION_PADDING,
  renderData,
  renderSection,
} from "../../../../src/logger/renderers.js"
import { GenericGardenError } from "../../../../src/exceptions.js"

import type { TaskMetadata } from "../../../../src/logger/log-entry.js"
import { createActionLog } from "../../../../src/logger/log-entry.js"
import logSymbols from "log-symbols"
import stripAnsi from "strip-ansi"
import { safeDumpYaml } from "../../../../src/util/serialization.js"
import { freezeTime } from "../../../helpers.js"
import { format } from "date-fns"
import { styles } from "../../../../src/logger/styles.js"
import { gardenEnv } from "../../../../src/constants.js"
import { uuidv4 } from "../../../../src/util/random.js"

const logger: Logger = getRootLogger()

beforeEach(() => {
  logger["entries"] = []
})

describe("renderers", () => {
  describe("renderMsg", () => {
    it("should render the message with the message style", () => {
      const log = logger.createLog().info("hello message")
      expect(renderMsg(log.entries[0])).to.equal(styles.primary("hello message"))
    })
    it("should render the message with the error style if the entry has error level", () => {
      const log = logger.createLog().error({ msg: "hello error" })
      expect(renderMsg(log.entries[0])).to.equal(styles.error("hello error"))
    })
    it("should render the message with the warning style if the entry has warning level", () => {
      const log = logger.createLog().warn({ msg: "hello error" })
      expect(renderMsg(log.entries[0])).to.equal(styles.warning("hello error"))
    })
  })
  describe("renderError", () => {
    it("should render error object if present", () => {
      const error = new GenericGardenError({
        message: "hello error",
        type: "a",
      })
      const log = logger.createLog().info({ msg: "foo", error })
      const rendered = renderError(log.entries[0])
      expect(rendered).to.include("hello error")
    })
  })
  describe("renderSection", () => {
    it("should use the log name for the section", () => {
      const log = logger.createLog({ name: "hello" }).info("foo")
      const withWhitespace = "hello".padEnd(SECTION_PADDING, " ")
      const rendered = stripAnsi(renderSection(log.entries[0]))
      expect(rendered).to.equal(`${withWhitespace} → `)
    })
    it("should properly format sections for action logs", () => {
      const log = logger.createLog({ name: "hello" })
      const actionLog = createActionLog({ log, action: { name: "api", kind: "Build", uid: uuidv4() } }).info("foo")
      const withWhitespace = "build.api".padEnd(SECTION_PADDING, " ")
      const rendered = stripAnsi(renderSection(actionLog.entries[0]))
      expect(rendered).to.equal(`${withWhitespace} → `)
    })
    it("should not render arrow if message is empty", () => {
      const log = logger.createLog({ name: "hello" }).info({ symbol: "success" })
      const withWhitespace = "hello".padEnd(SECTION_PADDING, " ")
      const rendered = stripAnsi(renderSection(log.entries[0]))
      expect(rendered).to.equal(`${withWhitespace}`)
    })
    it("should not truncate the section", () => {
      const log = logger.createLog({ name: "very-very-very-very-very-long" }).info("foo")
      const rendered = stripAnsi(renderSection(log.entries[0]))
      expect(rendered).to.equal(`very-very-very-very-very-long → `)
    })
  })
  describe("formatForTerminal", () => {
    it("should return the entry as a formatted string with a new line character", () => {
      const log = logger.createLog().info("")
      expect(formatForTerminal(log.entries[0], logger)).to.equal("\n")
    })
    it("should return an empty string without a new line if the parameter LogEntryParams is empty", () => {
      const log = logger.createLog().info({})
      expect(formatForTerminal(log.entries[0], logger)).to.equal("")
    })
    it("should return a string with a new line if any of the members of entry.message is not empty", () => {
      const logMsg = logger.createLog().info({ msg: "msg" })
      expect(formatForTerminal(logMsg.entries[0], logger)).contains("\n")

      const logSection = logger.createLog().info({ symbol: "success" })
      expect(formatForTerminal(logSection.entries[0], logger)).contains("\n")

      const logSymbol = logger.createLog().info({ symbol: "success" })
      expect(formatForTerminal(logSymbol.entries[0], logger)).contains("\n")

      const logData = logger.createLog().info({ data: { some: "data" } })
      expect(formatForTerminal(logData.entries[0], logger)).contains("\n")
    })
    it("should always render a symbol with sections", () => {
      const entry = logger.createLog({ name: "foo" }).info("hello world").getLatestEntry()

      expect(formatForTerminal(entry, logger)).to.equal(
        `${logSymbols["info"]} ${renderSection(entry)}${styles.primary("hello world")}\n`
      )
    })
    it("should print the log level if it's higher then 'info'", () => {
      const entry = logger.createLog().debug({ msg: "hello world" }).getLatestEntry()

      expect(formatForTerminal(entry, logger)).to.equal(`${styles.secondary("[debug] hello world")}\n`)
    })
    context("NO_COLOR=true", () => {
      before(() => {
        gardenEnv.NO_COLOR = true
      })
      after(() => {
        gardenEnv.NO_COLOR = false
      })
      it("should not use ANSI terminal colors", () => {
        const entry = logger.createLog({ name: "test-log" }).info({ msg: "hello world" }).getLatestEntry()

        const sectionWithPadding = "test-log".padEnd(SECTION_PADDING, " ")
        expect(formatForTerminal(entry, logger)).to.equal(`ℹ ${sectionWithPadding} → hello world\n`)
      })
    })
    context("basic", () => {
      before(() => {
        logger.showTimestamps = true
      })
      it("should include timestamp with formatted string", () => {
        const now = freezeTime()
        const entry = logger.createLog().info("hello world").getLatestEntry()

        expect(formatForTerminal(entry, logger)).to.equal(
          `${styles.secondary(format(now, "HH:mm:ss"))} ${styles.primary("hello world")}\n`
        )
      })
      after(() => {
        logger.showTimestamps = false
      })
    })
    describe("formatForJson", () => {
      it("should return a JSON representation of a log entry", () => {
        const now = freezeTime()
        const taskMetadata: TaskMetadata = {
          type: "a",
          key: "a",
          status: "active",
          uid: "1",
          inputVersion: "123",
        }
        const entry = logger
          .createLog()
          .info({
            msg: "hello",
            data: { foo: "bar" },
            metadata: { task: taskMetadata },
          })
          .getLatestEntry()
        expect(formatForJson(entry)).to.eql({
          msg: "hello",
          level: "info",
          section: "",
          timestamp: now.toISOString(),
          data: { foo: "bar" },
          metadata: { task: taskMetadata },
        })
      })
      it("should handle undefined messages", () => {
        const now = freezeTime()
        const entry = logger.createLog().info({}).getLatestEntry()
        expect(formatForJson(entry)).to.eql({
          msg: "",
          level: "info",
          section: "",
          data: undefined,
          metadata: undefined,
          timestamp: now.toISOString(),
        })
      })
    })
    describe("renderData", () => {
      const sampleData = {
        key: "value",
        key2: {
          value: [
            {
              key1: "value",
              key2: 3,
            },
          ],
        },
      }
      it("should render an empty string when no data is passed", () => {
        const entry = logger.createLog().info({}).getLatestEntry()
        expect(renderData(entry)).to.eql("")
      })
      it("should render yaml by default if data is passed", () => {
        const entry = logger.createLog().info({ data: sampleData }).getLatestEntry()
        const dataAsYaml = safeDumpYaml(sampleData, { noRefs: true })
        expect(renderData(entry)).to.eql(dataAsYaml)
      })
      it('should render yaml if dataFormat is "yaml"', () => {
        const entry = logger.createLog().info({ data: sampleData, dataFormat: "yaml" }).getLatestEntry()
        const dataAsYaml = safeDumpYaml(sampleData, { noRefs: true })
        expect(renderData(entry)).to.eql(dataAsYaml)
      })
      it('should render json if dataFormat is "json"', () => {
        const entry = logger.createLog().info({ data: sampleData, dataFormat: "json" }).getLatestEntry()
        expect(renderData(entry)).to.eql(JSON.stringify(sampleData, null, 2))
      })
    })
  })
})
