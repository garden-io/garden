import { expect } from "chai"

import { BasicTerminalWriter } from "../../../../../src/logger/writers/basic-terminal-writer"
import { getLogger } from "../../../../../src/logger/logger"
import { formatForTerminal } from "../../../../../src/logger/renderers"

const logger: any = getLogger()

beforeEach(() => {
  logger.children = []
})

describe("BasicTerminalWriter", () => {
  describe("render", () => {
    it("should return a formatted message if level is geq than entry level", () => {
      const writer = new BasicTerminalWriter()
      const entry = logger.info("hello logger")
      const out = writer.render(entry, logger)
      expect(out).to.eql(formatForTerminal(entry, "basic"))
    })
    it("should return a new line if message is an empty string", () => {
      const writer = new BasicTerminalWriter()
      const entry = logger.info("")
      const out = writer.render(entry, logger)
      expect(out).to.eql("\n")
    })
    it("should return null if entry level is geq to writer level", () => {
      const writer = new BasicTerminalWriter()
      const entry = logger.verbose("abc")
      const out = writer.render(entry, logger)
      expect(out).to.eql(null)
    })
    it("should return an empty string if entry is empty", () => {
      const writer = new BasicTerminalWriter()
      const entry = logger.placeholder()
      const out = writer.render(entry, logger)
      expect(out).to.eql("")
    })
  })
})
