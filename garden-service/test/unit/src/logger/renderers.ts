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
} from "../../../../src/logger/renderers"
import { GardenError } from "../../../../src/exceptions"
import dedent = require("dedent")
import { TaskMetadata } from "../../../../src/logger/log-entry"

const logger = getLogger()

beforeEach(() => {
  (<any>logger).children = []
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
    it("should join an array of messages with an arrow symbol and render with the error style" +
      " if the entry has error status", () => {
        const entry = logger.info({ msg: "error a", status: "error" })
        entry.setState({ msg: "error b", append: true })
        expect(renderMsg(entry)).to.equal(errorStyle("error a") + errorStyle(" → ") + errorStyle("error b"))
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
  })
  describe("chainMessages", () => {
    it("should correctly chain log messages", () => {
      const timestamp = Date.now()
      const messageStateTable = [
        [{ msg: "1", append: true }, { msg: "2", append: true }, { msg: "3", append: true }],
        [{ msg: "1", append: false }, { msg: "2", append: true }, { msg: "3", append: true }],
        [{ msg: "1", append: true }, { msg: "2", append: false }, { msg: "3", append: true }],
        [{ msg: "1", append: false }, { msg: "2", append: false }, { msg: "3", append: true }],
        [{ msg: "1", append: false }, { msg: "2", append: false }, { msg: "3", append: false }],
      ].map(msgStates => msgStates.map(msgState => ({ ...msgState, timestamp })))
      const expects = [
        ["1", "2", "3"],
        ["1", "2", "3"],
        ["2", "3"],
        ["2", "3"],
        ["3"],
      ]
      messageStateTable.forEach((msgState, index) => {
        expect(chainMessages(msgState)).to.eql(expects[index])
      })
    })
  })
  describe("formatForTerminal", () => {
    it("should return the entry as a formatted string with a new line character", () => {
      const entry = logger.info("")
      expect(formatForTerminal(entry)).to.equal("\n")
    })
    it("should return an empty string without a new line if the entry is empty", () => {
      const entry = logger.placeholder()
      expect(formatForTerminal(entry)).to.equal("")
    })
    it("should return an empty string without a new line if the parameter LogEntryParams is empty", () => {
      const entry = logger.info({})
      expect(formatForTerminal(entry)).to.equal("")
    })
    it("should return a string with a new line if any of the members of entry.messageState is not empty", () => {
      const entryMsg = logger.info({ msg: "msg" })
      expect(formatForTerminal(entryMsg)).contains("\n")

      const entryEmoji = logger.info({ emoji: "warning" })
      expect(formatForTerminal(entryEmoji)).contains("\n")

      const entrySection = logger.info({ section: "section" })
      expect(formatForTerminal(entrySection)).contains("\n")

      const entrySymbol = logger.info({ symbol: "success" })
      expect(formatForTerminal(entrySymbol)).contains("\n")

      const entryData = logger.info({ data: { some: "data" } })
      expect(formatForTerminal(entryData)).contains("\n")
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
})
