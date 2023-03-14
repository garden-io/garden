/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"

import { getLogger, Logger } from "../../../../src/logger/logger"
import {
  renderMsg,
  msgStyle,
  errorStyle,
  formatForTerminal,
  renderError,
  formatForJson,
  SECTION_PADDING,
  renderData,
  padSection,
  renderSection,
} from "../../../../src/logger/renderers"
import { GardenError } from "../../../../src/exceptions"
import dedent = require("dedent")
import { TaskMetadata } from "../../../../src/logger/log-entry"
import logSymbols = require("log-symbols")
import stripAnsi = require("strip-ansi")
import { highlightYaml, safeDumpYaml } from "../../../../src/util/serialization"
import { freezeTime } from "../../../helpers"
import chalk = require("chalk")

const logger: Logger = getLogger()

beforeEach(() => {
  logger["entries"] = []
})

describe("renderers", () => {
  describe("renderMsg", () => {
    it("should render the message with the message style", () => {
      const log = logger.makeNewLogContext().info("hello message")
      expect(renderMsg(log.entries[0])).to.equal(msgStyle("hello message"))
    })
    it("should render the message with the error style if the entry has error level", () => {
      const log = logger.makeNewLogContext().error({ msg: "hello error" })
      expect(renderMsg(log.entries[0])).to.equal(errorStyle("hello error"))
    })
  })
  describe("renderError", () => {
    it("should render error object if present", () => {
      const error: GardenError = {
        message: "hello error",
        type: "a",
        detail: {
          foo: "bar",
          _internal: "no show",
        },
      }
      const log = logger.makeNewLogContext().info({ msg: "foo", error })
      expect(renderError(log.entries[0])).to.equal(dedent`
          hello error

          Error Details:

          foo: bar\n
        `)
    })
  })
  describe("renderSection", () => {
    it("should render the log entry section with padding", () => {
      const log = logger.makeNewLogContext().info({ msg: "foo", section: "hello" })
      const withWhitespace = "hello".padEnd(SECTION_PADDING, " ")
      const rendered = stripAnsi(renderSection(log.entries[0]))
      expect(rendered).to.equal(`${withWhitespace} → `)
    })
    it("should not render arrow if message is empty", () => {
      const log = logger.makeNewLogContext().info({ section: "hello" })
      const withWhitespace = "hello".padEnd(SECTION_PADDING, " ")
      const rendered = stripAnsi(renderSection(log.entries[0]))
      expect(rendered).to.equal(`${withWhitespace}`)
    })
    it("should not not truncate the section", () => {
      const log = logger.makeNewLogContext().info({ msg: "foo", section: "very-very-very-very-very-long" })
      const rendered = stripAnsi(renderSection(log.entries[0]))
      expect(rendered).to.equal(`very-very-very-very-very-long → `)
    })
  })
  describe("formatForTerminal", () => {
    it("should return the entry as a formatted string with a new line character", () => {
      const log = logger.makeNewLogContext().info("")
      expect(formatForTerminal(log.entries[0])).to.equal("\n")
    })
    it("should return an empty string without a new line if the parameter LogEntryParams is empty", () => {
      const log = logger.makeNewLogContext().info({})
      expect(formatForTerminal(log.entries[0])).to.equal("")
    })
    it("should return a string with a new line if any of the members of entry.message is not empty", () => {
      const logMsg = logger.makeNewLogContext().info({ msg: "msg" })
      expect(formatForTerminal(logMsg.entries[0])).contains("\n")

      const logSection = logger.makeNewLogContext().info({ section: "section" })
      expect(formatForTerminal(logSection.entries[0])).contains("\n")

      const logSymbol = logger.makeNewLogContext().info({ symbol: "success" })
      expect(formatForTerminal(logSymbol.entries[0])).contains("\n")

      const logData = logger.makeNewLogContext().info({ data: { some: "data" } })
      expect(formatForTerminal(logData.entries[0])).contains("\n")
    })
    it("should always render a symbol with sections", () => {
      const entry = logger.makeNewLogContext().info({ msg: "hello world", section: "foo" }).getLatestEntry()

      expect(formatForTerminal(entry)).to.equal(
        `${logSymbols["info"]} ${renderSection(entry)}${msgStyle("hello world")}\n`
      )
    })
    it("should print the log level if it's higher then 'info'", () => {
      const entry = logger.makeNewLogContext().debug({ msg: "hello world" }).getLatestEntry()

      expect(formatForTerminal(entry)).to.equal(`${chalk.gray("[debug]")} ${msgStyle("hello world")}\n`)
    })
    it("should print the log level if it's higher then 'info' after the section if there is one", () => {
      const entry = logger.makeNewLogContext().debug({ msg: "hello world", section: "foo" }).getLatestEntry()

      const section = `foo ${chalk.gray("[debug]")}`
      expect(formatForTerminal(entry)).to.equal(
        `${logSymbols["info"]} ${chalk.cyan.italic(padSection(section))} → ${msgStyle("hello world")}\n`
      )
    })
    context("basic", () => {
      before(() => {
        logger.showTimestamps = true
      })
      it("should include timestamp with formatted string", () => {
        const now = freezeTime()
        const entry = logger.makeNewLogContext().info("hello world").getLatestEntry()

        expect(formatForTerminal(entry)).to.equal(`[${now.toISOString()}] ${msgStyle("hello world")}\n`)
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
          .makeNewLogContext()
          .info({
            msg: "hello",
            symbol: "info",
            section: "c",
            data: { foo: "bar" },
            metadata: { task: taskMetadata },
          })
          .getLatestEntry()
        expect(formatForJson(entry)).to.eql({
          msg: "hello",
          level: "info",
          timestamp: now.toISOString(),
          section: "c",
          data: { foo: "bar" },
          metadata: { task: taskMetadata },
        })
      })
      it("should handle undefined messages", () => {
        const now = freezeTime()
        const entry = logger.makeNewLogContext().info({}).getLatestEntry()
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
        const entry = logger.makeNewLogContext().info({}).getLatestEntry()
        expect(renderData(entry)).to.eql("")
      })
      it("should render yaml by default if data is passed", () => {
        const entry = logger.makeNewLogContext().info({ data: sampleData }).getLatestEntry()
        const dataAsYaml = safeDumpYaml(sampleData, { noRefs: true })
        expect(renderData(entry)).to.eql(highlightYaml(dataAsYaml))
      })
      it('should render yaml if dataFormat is "yaml"', () => {
        const entry = logger.makeNewLogContext().info({ data: sampleData, dataFormat: "yaml" }).getLatestEntry()
        const dataAsYaml = safeDumpYaml(sampleData, { noRefs: true })
        expect(renderData(entry)).to.eql(highlightYaml(dataAsYaml))
      })
      it('should render json if dataFormat is "json"', () => {
        const entry = logger.makeNewLogContext().info({ data: sampleData, dataFormat: "json" }).getLatestEntry()
        expect(renderData(entry)).to.eql(JSON.stringify(sampleData, null, 2))
      })
    })
  })
})
