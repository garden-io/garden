import { expect } from "chai"

import { getLogger } from "../../../../src/logger/logger"
import {
  renderMsg,
  msgStyle,
  errorStyle,
  formatForTerminal,
  chainMessages,
  renderError,
  formatForJson,
  renderSection,
  MAX_SECTION_WIDTH,
  renderData,
} from "../../../../src/logger/renderers"
import { GardenError } from "../../../../src/exceptions"
import dedent = require("dedent")
import { TaskMetadata } from "../../../../src/logger/log-entry"
import logSymbols = require("log-symbols")
import stripAnsi = require("strip-ansi")
import yaml from "js-yaml"
import { highlightYaml } from "../../../../src/util/util"

const logger: any = getLogger()

beforeEach(() => {
  logger.children = []
})

describe("renderers", () => {
  describe("renderMsg", () => {
    it("should return an empty string if the entry is empty", () => {
      const entry = logger.placeholder()
      expect(renderMsg(entry)).to.equal("")
    })
    it("should render the message with the message style", () => {
      const entry = logger.info({ msg: "hello message" })
      expect(renderMsg(entry)).to.equal(msgStyle("hello message"))
    })
    it("should join an array of messages with an arrow symbol and render with the message style", () => {
      const entry = logger.info("message a")
      entry.setState({ msg: "message b", append: true })
      expect(renderMsg(entry)).to.equal(msgStyle("message a") + msgStyle(" → ") + msgStyle("message b"))
    })
    it("should render the message without styles if the entry is from an intercepted stream", () => {
      const entry = logger.info({ fromStdStream: true, msg: "hello stream" })
      expect(renderMsg(entry)).to.equal("hello stream")
    })
    it("should join an array of messages and render without styles if the entry is from an intercepted stream", () => {
      const entry = logger.info({ fromStdStream: true, msg: "stream a" })
      entry.setState({ msg: "stream b", append: true })
      expect(renderMsg(entry)).to.equal("stream a stream b")
    })
    it("should render the message with the error style if the entry has error status", () => {
      const entry = logger.info({ msg: "hello error", status: "error" })
      expect(renderMsg(entry)).to.equal(errorStyle("hello error"))
    })
    it(
      "should join an array of messages with an arrow symbol and render with the error style" +
        " if the entry has error status",
      () => {
        const entry = logger.info({ msg: "error a", status: "error" })
        entry.setState({ msg: "error b", append: true })
        expect(renderMsg(entry)).to.equal(errorStyle("error a") + errorStyle(" → ") + errorStyle("error b"))
      }
    )
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
      const entry = logger.info({ msg: "foo", error })
      expect(renderError(entry)).to.equal(dedent`
          hello error
          Error Details:
          foo: bar\n
        `)
    })
    it("should join an array of messages if no error object", () => {
      const entry = logger.info({ msg: "error a" })
      entry.setState({ msg: "moar", append: true })
      expect(renderError(entry)).to.eql("error a moar")
    })
  })
  describe("renderSection", () => {
    it("should render the log entry section", () => {
      const entry = logger.info({ msg: "foo", section: "hello" })
      const withWhitespace = "hello".padEnd(MAX_SECTION_WIDTH, " ")
      const rendered = stripAnsi(renderSection(entry))
      expect(rendered).to.equal(`${withWhitespace} → `)
    })
    it("should not render arrow if message is empty", () => {
      const entry = logger.info({ section: "hello" })
      const withWhitespace = "hello".padEnd(MAX_SECTION_WIDTH, " ")
      const rendered = stripAnsi(renderSection(entry))
      expect(rendered).to.equal(`${withWhitespace}`)
    })
    it("should optionally set a custom section width", () => {
      const entry = logger.info({ msg: "foo", section: "hello", maxSectionWidth: 8 })
      const withWhitespace = "hello".padEnd(8, " ")
      const rendered = stripAnsi(renderSection(entry))
      expect(rendered).to.equal(`${withWhitespace} → `)
    })
    it("should not let custom section width exceed max section width", () => {
      const entry = logger.info({ msg: "foo", section: "hello", maxSectionWidth: 99 })
      const withWhitespace = "hello".padEnd(MAX_SECTION_WIDTH, " ")
      const rendered = stripAnsi(renderSection(entry))
      expect(rendered).to.equal(`${withWhitespace} → `)
    })
  })
  describe("chainMessages", () => {
    it("should correctly chain log messages", () => {
      const timestamp = Date.now()
      const messageStateTable = [
        [
          { msg: "1", append: true },
          { msg: "2", append: true },
          { msg: "3", append: true },
        ],
        [
          { msg: "1", append: false },
          { msg: "2", append: true },
          { msg: "3", append: true },
        ],
        [
          { msg: "1", append: true },
          { msg: "2", append: false },
          { msg: "3", append: true },
        ],
        [
          { msg: "1", append: false },
          { msg: "2", append: false },
          { msg: "3", append: true },
        ],
        [
          { msg: "1", append: false },
          { msg: "2", append: false },
          { msg: "3", append: false },
        ],
      ].map((msgStates) => msgStates.map((msgState) => ({ ...msgState, timestamp })))
      const expects = [["1", "2", "3"], ["1", "2", "3"], ["2", "3"], ["2", "3"], ["3"]]
      messageStateTable.forEach((msgState, index) => {
        expect(chainMessages(msgState)).to.eql(expects[index])
      })
    })
  })
  describe("formatForTerminal", () => {
    it("should return the entry as a formatted string with a new line character", () => {
      const entry = logger.info("")
      expect(formatForTerminal(entry, "fancy")).to.equal("\n")
    })
    it("should return an empty string without a new line if the entry is empty", () => {
      const entry = logger.placeholder()
      expect(formatForTerminal(entry, "fancy")).to.equal("")
    })
    it("should return an empty string without a new line if the parameter LogEntryParams is empty", () => {
      const entry = logger.info({})
      expect(formatForTerminal(entry, "fancy")).to.equal("")
    })
    it("should return a string with a new line if any of the members of entry.messageState is not empty", () => {
      const entryMsg = logger.info({ msg: "msg" })
      expect(formatForTerminal(entryMsg, "fancy")).contains("\n")

      const entryEmoji = logger.info({ emoji: "warning" })
      expect(formatForTerminal(entryEmoji, "fancy")).contains("\n")

      const entrySection = logger.info({ section: "section" })
      expect(formatForTerminal(entrySection, "fancy")).contains("\n")

      const entrySymbol = logger.info({ symbol: "success" })
      expect(formatForTerminal(entrySymbol, "fancy")).contains("\n")

      const entryData = logger.info({ data: { some: "data" } })
      expect(formatForTerminal(entryData, "fancy")).contains("\n")
    })
    context("active entry with no symbol", () => {
      it("should render an info symbol for basic entries", () => {
        const entry = logger.info({ status: "active", msg: "" })
        expect(formatForTerminal(entry, "basic")).to.eql(logSymbols.info + " \n")
      })
      it("should not render anything for fancy entries", () => {
        const entry = logger.info({ status: "active", msg: "" })
        expect(formatForTerminal(entry, "fancy")).to.eql("\n")
      })
    })
  })
  describe("formatForJson", () => {
    it("should return a JSON representation of a log entry", () => {
      const taskMetadata: TaskMetadata = {
        type: "a",
        key: "a",
        status: "active",
        uid: "1",
        versionString: "123",
      }
      const entry = logger.info({
        msg: "hello",
        emoji: "haircut",
        symbol: "info",
        status: "done",
        section: "c",
        data: { foo: "bar" },
        metadata: { task: taskMetadata },
      })
      expect(formatForJson(entry)).to.eql({
        msg: "hello",
        section: "c",
        data: { foo: "bar" },
        metadata: { task: taskMetadata },
      })
    })
    it("should append messages if applicable", () => {
      const entry = logger.info({
        msg: "hello",
      })
      entry.setState({ msg: "world", append: true })
      expect(formatForJson(entry)).to.eql({
        msg: "hello - world",
        section: "",
        data: undefined,
        metadata: undefined,
      })
    })
    it("should handle undefined messages", () => {
      const entry = logger.placeholder()
      expect(formatForJson(entry)).to.eql({
        msg: "",
        section: "",
        data: undefined,
        metadata: undefined,
      })
    })
  })
  describe.only("renderData", () => {
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
      const entry = logger.placeholder()
      expect(renderData(entry)).to.eql("")
    })
    it("should render yaml by default if data is passed", () => {
      const entry = logger.info({ data: sampleData })
      const dataAsYaml = yaml.safeDump(sampleData, { noRefs: true, skipInvalid: true })
      expect(renderData(entry)).to.eql(highlightYaml(dataAsYaml))
    })
    it('should render yaml if dataFormat is "yaml"', () => {
      const entry = logger.info({ data: sampleData, dataFormat: "yaml" })
      const dataAsYaml = yaml.safeDump(sampleData, { noRefs: true, skipInvalid: true })
      expect(renderData(entry)).to.eql(highlightYaml(dataAsYaml))
    })
    it('should render json if dataFormat is "json"', () => {
      const entry = logger.info({ data: sampleData, dataFormat: "json" })
      expect(renderData(entry)).to.eql(JSON.stringify(sampleData, null, 2))
    })
  })
})
