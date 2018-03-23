import { expect } from "chai"

import { LogLevel, EntryStatus, LogSymbolType, LoggerType } from "../../src/logger/types"
import { BasicConsoleWriter,  FancyConsoleWriter } from "../../src/logger/writers"
import { RootLogNode } from "../../src/logger"
import { getChildNodes } from "../../src/logger/util"

const logger = new RootLogNode({ level: LogLevel.silent })

logger.error({ msg: "error" })
logger.warn({ msg: "warn" })
logger.info({ msg: "info" })
logger.verbose({ msg: "verbose" })
logger.debug({ msg: "debug" })
logger.silly({ msg: "silly" })

describe("RootLogNode", () => {

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
    it("should add new child entries to respective node", () => {
      const prevLength = logger.children.length
      const entry = logger.children[0]
      const nested = entry.info({ msg: "nested" })
      const deepNested = nested.info({ msg: "deep" })

      expect(logger.children[0].children).to.have.lengthOf(1)
      expect(logger.children[0].children[0]).to.eql(nested)
      expect(logger.children[0].children[0].children[0]).to.eql(deepNested)
      expect(logger.children).to.have.lengthOf(prevLength)
      expect(deepNested["depth"]).to.equal(2)
    })
  })

  describe("BasicConsoleWriter.render", () => {
    it("should return a string if log level is geq than entry level", () => {
      const writer = new BasicConsoleWriter({ level: LogLevel.silent })
      const logger2 = new RootLogNode({ level: LogLevel.silent })
      const entry = logger2.info({ msg: "" })
      const out1 = writer.render(entry, logger2)
      writer.level = LogLevel.verbose
      const out2 = writer.render(entry, logger2)

      expect(out1).to.be.a("null")
      expect(out2).to.be.a("string")
    })
  })

  describe("FancyConsoleWriter.render", () => {
    it("should return an array of strings if log level is geq than respective entry level", () => {
      const writer = new FancyConsoleWriter({ level: LogLevel.silent })
      const logger3 = new RootLogNode({level: LogLevel.silent})
      const entry = logger3.info({ msg: "" })
      const out1 = writer.render(logger3)
      writer.level = LogLevel.verbose
      const out2 = writer.render(logger3)

      writer.stop()

      expect(out1).to.be.a("null")
      expect(out2).to.be.an("array").of.length(1)
    })
  })

  describe("LogEntry", () => {
    const entry = logger.children[0]
    describe("setState", () => {
      it("should update entry state and optionally append new msg to previous msg", () => {
        entry.setState({ msg: "new" })
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
      it("should convert an n-ary tree into an ordered list of nodes", () => {
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
          id: "root",
        }
        const nodeList = getChildNodes(graph)
        expect(nodeList.map(n => n.id)).to.eql([1, 2, 3, 4, 5, 6])
      })
    })
  })
})
