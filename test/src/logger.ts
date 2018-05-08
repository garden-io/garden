import { expect } from "chai"

import { LogLevel, EntryStatus, LogSymbolType, LoggerType } from "../../src/logger/types"
import { BasicConsoleWriter, FancyConsoleWriter } from "../../src/logger/writers"
import { RootLogNode } from "../../src/logger"
import { getChildNodes } from "../../src/logger/util"

describe("LogNode", () => {
  describe("findById", () => {
    it("should return the first log entry with a matching id and undefined otherwise", () => {
      const logger = new RootLogNode({ level: LogLevel.info })
      logger.info({msg: "0"})
      logger.info({msg: "a1", id: "a"})
      logger.info({msg: "a2", id: "a"})
      expect(logger.findById("a")["opts"]["msg"]).to.eql("a1")
      expect(logger.findById("z")).to.be.undefined
    })
  })

  describe("filterBySection", () => {
    it("should return an array of all entries with the matching section name", () => {
      const logger = new RootLogNode({ level: LogLevel.info })
      logger.info({section: "s0"})
      logger.info({section: "s1", id: "a"})
      logger.info({section: "s2"})
      logger.info({section: "s1", id: "b"})
      const s1 = logger.filterBySection("s1")
      const sEmpty = logger.filterBySection("s99")
      expect(s1.map(entry => entry.opts.id)).to.eql(["a", "b"])
      expect(sEmpty).to.eql([])
    })
  })

})

describe("RootLogNode", () => {
  const logger = new RootLogNode({ level: LogLevel.info })

  logger.error("error")
  logger.warn("warn")
  logger.info("info")
  logger.verbose("verbose")
  logger.debug("debug")
  logger.silly("silly")

  describe("getLogEntries", () => {
    it("should return an ordered list of log entries", () => {
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

describe("BasicConsoleWriter.render", () => {
  it("should return a string if level is geq than entry level and entry contains a message", () => {
    const logger = new RootLogNode({ level: LogLevel.info })
    const writer = new BasicConsoleWriter()
    const entry = logger.info("")
    const out = writer.render(entry, logger)
    expect(out).to.eql("")
  })
  it("should override root level if level is set", () => {
    const logger = new RootLogNode({ level: LogLevel.info })
    const writer = new BasicConsoleWriter({ level: LogLevel.verbose })
    const entry = logger.verbose("")
    const out = writer.render(entry, logger)
    expect(out).to.eql("")
  })
  it("should return null if entry level is geq to writer level", () => {
    const logger = new RootLogNode({ level: LogLevel.info })
    const writer = new BasicConsoleWriter()
    const entry = logger.verbose("")
    const out = writer.render(entry, logger)
    expect(out).to.eql(null)
  })
  it("should return null if entry has no message", () => {
    const logger = new RootLogNode({ level: LogLevel.info })
    const writer = new BasicConsoleWriter()
    const entry = logger.info({})
    const out = writer.render(entry, logger)
    expect(out).to.eql(null)
  })
})

describe("FancyConsoleWriter.render", () => {
  it("should return an array of strings if level is geq than entry level and entry contains a message", () => {
    const logger = new RootLogNode({ level: LogLevel.info })
    const writer = new FancyConsoleWriter()
    const entry = logger.info("")
    const out = writer.render(logger)
    writer.stop()
    expect(out).to.eql(["\n"])
  })
  it("should override root level if level is set", () => {
    const logger = new RootLogNode({ level: LogLevel.info })
    const writer = new FancyConsoleWriter({ level: LogLevel.verbose })
    writer.stop()
    const entry = logger.verbose("")
    const out = writer.render(logger)
    expect(out).to.eql(["\n"])
  })
  it("should return null if entry level is geq to writer level", () => {
    const logger = new RootLogNode({ level: LogLevel.info })
    const writer = new FancyConsoleWriter()
    writer.stop()
    const entry = logger.verbose("")
    const out = writer.render(logger)
    expect(out).to.eql(null)
  })
  it("should return null if entry has no message", () => {
    const logger = new RootLogNode({ level: LogLevel.info })
    const writer = new FancyConsoleWriter()
    writer.stop()
    const entry = logger.info({})
    const out = writer.render(logger)
    expect(out).to.eql(null)
  })
})

describe("LogEntry", () => {
  const logger = new RootLogNode({ level: LogLevel.info })
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
      expect(entry["status"]).to.equal(EntryStatus.DONE)
    })
  })
  describe("setSuccess", () => {
    it("should update entry state and set status and symbol to success", () => {
      entry.setSuccess()
      expect(entry["status"]).to.equal(EntryStatus.SUCCESS)
      expect(entry["opts"]["symbol"]).to.equal(LogSymbolType.success)
    })
  })
  describe("setError", () => {
    it("should update entry state and set status and symbol to error", () => {
      entry.setError()
      expect(entry["status"]).to.equal(EntryStatus.ERROR)
      expect(entry["opts"]["symbol"]).to.equal(LogSymbolType.error)
    })
  })
  describe("setWarn", () => {
    it("should update entry state and set status and symbol to warn", () => {
      entry.setWarn()
      expect(entry["status"]).to.equal(EntryStatus.WARN)
      expect(entry["opts"]["symbol"]).to.equal(LogSymbolType.warn)
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
      const nodeList = getChildNodes<TestNode>(graph)
      expect(nodeList.map(n => n.id)).to.eql([1, 2, 3, 4, 5, 6])
    })
  })
})
