import { expect } from "chai"

import { LogLevel, EntryStatus, LogSymbolType } from "../../src/logger/types"
import { BasicLogger, FancyLogger } from "../../src/logger"
import { getNodeListFromTree } from "../../src/logger/util"

const logger = new BasicLogger(LogLevel.silent)

logger.error({ msg: "error" })
logger.warn({ msg: "warn" })
logger.info({ msg: "info" })
logger.verbose({ msg: "verbose" })
logger.debug({ msg: "debug" })
logger.silly({ msg: "silly" })

describe("Logger", () => {
  it("should contain an ordered list of log entries", () => {

    const result = logger.entries
    const levels = result.map(e => e.level)

    expect(result).to.have.lengthOf(6)
    expect(levels).to.eql([
      LogLevel.error,
      LogLevel.warn,
      LogLevel.info,
      LogLevel.verbose,
      LogLevel.debug,
      LogLevel.silly,
    ])
  })

  describe("nest", () => {
    it("should nest new child entries", () => {
      const prevLength = logger.entries.length
      const entry = logger.entries[0]
      const nested = entry.nest.info({ msg: "nested" })
      const deepNested = nested.nest.info({ msg: "deep" })

      expect(logger.entries[0].children).to.have.lengthOf(1)
      expect(logger.entries[0].children[0]).to.eql(nested)
      expect(logger.entries[0].children[0].children[0]).to.eql(deepNested)
      expect(logger.entries).to.have.lengthOf(prevLength)
      expect(deepNested["depth"]).to.equal(2)
    })
  })

  describe("BasicLogger.render", () => {
    it("should return a string if level is geq to log entry level", () => {
      const basic = new BasicLogger(LogLevel.silent)
      basic.info({ msg: "" })
      const out1 = basic.render()
      basic.level = LogLevel.verbose
      const out2 = basic.render()

      expect(out1).to.a("null")
      expect(out2).to.be.a("string")
    })
  })

  describe("FancyLogger.render", () => {
    it("should return an array of strings if level is geq to entry level", () => {
      const fancy = new FancyLogger(LogLevel.silent)
      fancy.info({ msg: "" })
      const out1 = fancy.render()
      fancy.level = LogLevel.verbose
      const out2 = fancy.render()

      expect(out1).to.be.a("null")
      expect(out2).to.be.an("array").of.length(1)
    })
  })

  describe("LogEntry", () => {
    const entry = logger.entries[0]
    describe("update", () => {
      it("should update entry state and optionally append new msg to previous msg", () => {
        entry.update({ msg: "new" })
        expect(entry["opts"]["msg"]).to.equal("new")
        entry.update({ msg: "new2", append: true })
        expect(entry["opts"]["msg"]).to.eql(["new", "new2"])
      })
    })
    describe("done", () => {
      it("should update entry state and set status to done", () => {
        entry.done()
        expect(entry["status"]).to.equal(EntryStatus.DONE)
      })
    })
    describe("success", () => {
      it("should update entry state and set status and symbol to success", () => {
        entry.success()
        expect(entry["status"]).to.equal(EntryStatus.SUCCESS)
        expect(entry["opts"]["symbol"]).to.equal(LogSymbolType.success)
      })
    })
    describe("error", () => {
      it("should update entry state and set status and symbol to error", () => {
        entry.error()
        expect(entry["status"]).to.equal(EntryStatus.ERROR)
        expect(entry["opts"]["symbol"]).to.equal(LogSymbolType.error)
      })
    })
    describe("warn", () => {
      it("should update entry state and set status and symbol to warn", () => {
        entry.warn()
        expect(entry["status"]).to.equal(EntryStatus.WARN)
        expect(entry["opts"]["symbol"]).to.equal(LogSymbolType.warn)
      })
    })
  })

  describe("util", () => {
    describe("getNodeListFromTree", () => {
      it("should convert an n-ary tree into an ordered list of nodes", () => {
        const graph = {
          children: [
            {
              children: [
                {
                  children: [
                    { children: [], idx: 4 },
                  ],
                  idx: 3,
                },
                { children: [], idx: 5 },
                { children: [], idx: 6 },
              ],
              idx: 2,
            },
            {
              children: [

              ],
              idx: 7,
            },
          ],
          idx: 1,
        }
        const nodeList = getNodeListFromTree(graph)
        expect(nodeList.map(n => n.idx)).to.eql([1, 2, 3, 4, 5, 6, 7])
      })
    })
  })
})
