import { expect } from "chai"
import { LogLevel } from "../../src/logger/log-node"
import { BasicTerminalWriter } from "../../src/logger/writers/basic-terminal-writer"
import { FancyTerminalWriter } from "../../src/logger/writers/fancy-terminal-writer"
import { getLogger } from "../../src/logger/logger"
import { getChildNodes } from "../../src/logger/util"

const logger = getLogger()

beforeEach(() => {
  (<any>logger).children = []
})

describe("LogNode", () => {

  describe("findById", () => {
    it("should return the first log entry with a matching id and undefined otherwise", () => {
      logger.info({ msg: "0" })
      logger.info({ msg: "a1", id: "a" })
      logger.info({ msg: "a2", id: "a" })
      expect(logger.findById("a")["opts"]["msg"]).to.eql("a1")
      expect(logger.findById("z")).to.be.undefined
    })
  })

  describe("filterBySection", () => {
    it("should return an array of all entries with the matching section name", () => {
      logger.info({ section: "s0" })
      logger.info({ section: "s1", id: "a" })
      logger.info({ section: "s2" })
      logger.info({ section: "s1", id: "b" })
      const s1 = logger.filterBySection("s1")
      const sEmpty = logger.filterBySection("s99")
      expect(s1.map(entry => entry.id)).to.eql(["a", "b"])
      expect(sEmpty).to.eql([])
    })
  })

})

describe("RootLogNode", () => {
  describe("getLogEntries", () => {
    it("should return an ordered list of log entries", () => {
      logger.error("error")
      logger.warn("warn")
      logger.info("info")
      logger.verbose("verbose")
      logger.debug("debug")
      logger.silly("silly")

      const entries = logger.getLogEntries()
      const levels = entries.map(e => e.level)

      expect(entries).to.have.lengthOf(6)
      expect(levels).to.eql([
        LogLevel.error,
        LogLevel.warn,
        LogLevel.info,
        LogLevel.verbose,
        LogLevel.debug,
        LogLevel.silly,
      ])
    })
  })

  describe("addNode", () => {
    it("should add new child entries to the respective node", () => {
      logger.error("error")
      logger.warn("warn")
      logger.info("info")
      logger.verbose("verbose")
      logger.debug("debug")
      logger.silly("silly")

      const prevLength = logger.children.length
      const entry = logger.children[0]
      const nested = entry.info("nested")
      const deepNested = nested.info("deep")

      expect(logger.children[0].children).to.have.lengthOf(1)
      expect(logger.children[0].children[0]).to.eql(nested)
      expect(logger.children[0].children[0].children[0]).to.eql(deepNested)
      expect(logger.children).to.have.lengthOf(prevLength)
      expect(deepNested["depth"]).to.equal(2)
    })
  })

})

describe("Writers", () => {
  describe("BasicTerminalWriter.render", () => {
    it("should return a string if level is geq than entry level and entry contains a message", () => {
      const writer = new BasicTerminalWriter()
      const entry = logger.info("")
      const out = writer.render(entry, logger)
      expect(out).to.eql("\n")
    })
    it("should override root level if level is set", () => {
      const writer = new BasicTerminalWriter({ level: LogLevel.verbose })
      const entry = logger.verbose("")
      const out = writer.render(entry, logger)
      expect(out).to.eql("\n")
    })
    it("should return null if entry level is geq to writer level", () => {
      const writer = new BasicTerminalWriter()
      const entry = logger.verbose("")
      const out = writer.render(entry, logger)
      expect(out).to.eql(null)
    })
    it("should return null if entry is empty", () => {
      const writer = new BasicTerminalWriter()
      const entry = logger.info()
      const out = writer.render(entry, logger)
      expect(out).to.eql(null)
    })
    it("should return null if entry has no message", () => {
      const writer = new BasicTerminalWriter()
      const entry = logger.info({})
      const out = writer.render(entry, logger)
      expect(out).to.eql(null)
    })
  })

  describe("FancyTerminalWriter.toTerminalEntries", () => {
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
      logger.info()
      const terminalEntries = writer.toTerminalEntries(logger)
      expect(terminalEntries).to.eql([])
    })
  })

})

describe("LogEntry", () => {
  const entry = logger.info("")
  describe("setState", () => {
    it("should update entry state and optionally append new msg to previous msg", () => {
      entry.setState("new")
      expect(entry["opts"]["msg"]).to.equal("new")
      entry.setState({ msg: "new2", append: true })
      expect(entry["opts"]["msg"]).to.eql(["new", "new2"])
    })
  })
  describe("setDone", () => {
    it("should update entry state and set status to done", () => {
      entry.setDone()
      expect(entry.opts.status).to.equal("done")
    })
  })
  describe("setSuccess", () => {
    it("should update entry state and set status and symbol to success", () => {
      entry.setSuccess()
      expect(entry.opts.status).to.equal("success")
      expect(entry.opts.symbol).to.equal("success")
    })
  })
  describe("setError", () => {
    it("should update entry state and set status and symbol to error", () => {
      entry.setError()
      expect(entry.opts.status).to.equal("error")
      expect(entry.opts.symbol).to.equal("error")
    })
  })
  describe("setWarn", () => {
    it("should update entry state and set status and symbol to warn", () => {
      entry.setWarn()
      expect(entry.opts.status).to.equal("warn")
      expect(entry.opts.symbol).to.equal("warning")
    })
  })
})

describe("util", () => {
  describe("getChildNodes", () => {
    it("should convert an n-ary tree into an ordered list of child nodes (skipping the root)", () => {
      interface TestNode {
        children: any[]
        id: number
      }
      const graph = {
        children: [
          {
            children: [
              {
                children: [
                  { children: [], id: 3 },
                ],
                id: 2,
              },
              { children: [], id: 4 },
              { children: [], id: 5 },
            ],
            id: 1,
          },
          {
            children: [

            ],
            id: 6,
          },
        ],
        id: 0,
      }
      const nodeList = getChildNodes<TestNode, TestNode>(graph)
      expect(nodeList.map(n => n.id)).to.eql([1, 2, 3, 4, 5, 6])
    })
  })
})
