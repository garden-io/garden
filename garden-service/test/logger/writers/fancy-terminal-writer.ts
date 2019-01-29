import { expect } from "chai"

import { LogLevel } from "../../../src/logger/log-node"
import { FancyTerminalWriter } from "../../../src/logger/writers/fancy-terminal-writer"
import { getLogger } from "../../../src/logger/logger"

const logger = getLogger()

beforeEach(() => {
  (<any>logger).children = []
})

describe("FancyTerminalWriter", () => {
  describe("toTerminalEntries", () => {
    const writer = new FancyTerminalWriter()
    const verboseWriter = new FancyTerminalWriter({ level: LogLevel.verbose })
    writer.stop()
    verboseWriter.stop()
    it("should map a LogNode into an array of entries with line numbers and spinner positions", () => {
      logger.info("1 line") // 0
      logger.info("2 lines\n") // 1
      logger.info("1 line") // 3
      logger.info("3 lines\n\n") // 4
      const spinner = logger.info({ msg: "spinner", status: "active" }) // 7
      spinner.info({ msg: "nested spinner", status: "active" }) // 8
      const terminalEntries = writer.toTerminalEntries(logger)
      const lineNumbers = terminalEntries.map(e => e.lineNumber)
      const spinners = terminalEntries.filter(e => !!e.spinnerCoords).map(e => e.spinnerCoords)
      expect(lineNumbers).to.eql([0, 1, 3, 4, 7, 8])
      expect(spinners).to.eql([[0, 7], [3, 8]])
    })
    it("should override root level if level is set", () => {
      const entry = logger.verbose("")
      const terminalEntries = verboseWriter.toTerminalEntries(logger)
      expect(terminalEntries[0].key).to.eql(entry.key)
    })
    it("should skip entry if entry level is geq to writer level", () => {
      logger.verbose("")
      const terminalEntries = writer.toTerminalEntries(logger)
      expect(terminalEntries).to.eql([])
    })
    it("should skip entry if entry is empty", () => {
      logger.placeholder()
      const terminalEntries = writer.toTerminalEntries(logger)
      expect(terminalEntries).to.eql([])
    })
  })
})
