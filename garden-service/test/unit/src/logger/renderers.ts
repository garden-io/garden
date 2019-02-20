import { expect } from "chai"

import { getLogger } from "../../../../src/logger/logger"
import {
  renderMsg,
  msgStyle,
  errorStyle,
  formatForTerminal,
} from "../../../../src/logger/renderers"

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
      const entry = logger.info({ msg: ["message a", "message b"] })
      expect(renderMsg(entry)).to.equal(msgStyle("message a") + msgStyle(" → ") + msgStyle("message b"))
    })
    it("should render the message without styles if the entry is from an intercepted stream", () => {
      const entry = logger.info({ fromStdStream: true, msg: "hello stream" })
      expect(renderMsg(entry)).to.equal("hello stream")
    })
    it("should join an array of messages and render without styles if the entry is from an intercepted stream", () => {
      const entry = logger.info({ fromStdStream: true, msg: ["stream a", "stream b"] })
      expect(renderMsg(entry)).to.equal("stream a stream b")
    })
    it("should render the message with the error style if the entry has error status", () => {
      const entry = logger.info({ msg: "hello error", status: "error" })
      expect(renderMsg(entry)).to.equal(errorStyle("hello error"))
    })
    it("should join an array of messages with an arrow symbol and render with the error style" +
      " if the entry has error status", () => {
        const entry = logger.info({ msg: ["error a", "error b"], status: "error" })
        expect(renderMsg(entry)).to.equal(errorStyle("error a") + errorStyle(" → ") + errorStyle("error b"))
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
  })
})
