import { expect } from "chai"

import { getLogger } from "../../src/logger/logger"

const logger = getLogger()

beforeEach(() => {
  (<any>logger).children = []
})

describe("LogEntry", () => {
  it("should dedent placeholder log entries", () => {
    const ph1 = logger.placeholder()
    const ph2 = ph1.placeholder()
    const nonEmpty = ph1.info("foo")
    const nested = nonEmpty.info("foo")
    const nestedPh = nested.placeholder()
    const indents = [
      ph1.opts.indent,
      ph2.opts.indent,
      nonEmpty.opts.indent,
      nested.opts.indent,
      nestedPh.opts.indent,
    ]
    expect(indents).to.eql([-1, -1, 0, 1, 0])
  })
  it("should indent nested log entries", () => {
    const entry = logger.info("hello")
    const nested = entry.info("nested")
    const deepNested = nested.info("deep nested")
    const deepDeepNested = deepNested.info("deep deep inside")
    const deepDeepPh = deepDeepNested.placeholder()
    const deepDeepNested2 = deepDeepPh.info("")
    const indents = [
      entry.opts.indent,
      nested.opts.indent,
      deepNested.opts.indent,
      deepDeepNested.opts.indent,
      deepDeepPh.opts.indent,
      deepDeepNested2.opts.indent,
    ]
    expect(indents).to.eql([undefined, 1, 2, 3, 2, 3])
  })
  context("childEntriesInheritLevel is set to true", () => {
    it("should create a log entry whose children inherit the parent level", () => {
      const verbose = logger.verbose({ childEntriesInheritLevel: true })
      const error = verbose.error("")
      const silly = verbose.silly("")
      const deepError = error.error("")
      const deepSillyError = silly.error("")
      const deepSillySilly = silly.silly("")
      const levels = [
        verbose.warn("").level,
        verbose.info("").level,
        verbose.verbose("").level,
        verbose.debug("").level,
        verbose.silly("").level,
        deepError.level,
        deepSillyError.level,
        deepSillySilly.level,
      ]
      expect(levels).to.eql([3, 3, 3, 4, 5, 3, 3, 5])
    })
  })
  describe("setState", () => {
    it("should update entry state and optionally append new msg to previous msg", () => {
      const entry = logger.info("")
      entry.setState("new")
      expect(entry.opts.msg).to.equal("new")
      entry.setState({ msg: "new2", append: true })
      expect(entry.opts.msg).to.eql(["new", "new2"])
    })
  })
  describe("setState", () => {
    it("should preserve status", () => {
      const entry = logger.info("")
      entry.setSuccess()
      entry.setState("change text")
      expect(entry.opts.status).to.equal("success")
    })
  })
  describe("setDone", () => {
    it("should update entry state and set status to done", () => {
      const entry = logger.info("")
      entry.setDone()
      expect(entry.opts.status).to.equal("done")
    })
  })
  describe("setSuccess", () => {
    it("should update entry state and set status and symbol to success", () => {
      const entry = logger.info("")
      entry.setSuccess()
      expect(entry.opts.status).to.equal("success")
      expect(entry.opts.symbol).to.equal("success")
    })
  })
  describe("setError", () => {
    it("should update entry state and set status and symbol to error", () => {
      const entry = logger.info("")
      entry.setError()
      expect(entry.opts.status).to.equal("error")
      expect(entry.opts.symbol).to.equal("error")
    })
  })
  describe("setWarn", () => {
    it("should update entry state and set status and symbol to warn", () => {
      const entry = logger.info("")
      entry.setWarn()
      expect(entry.opts.status).to.equal("warn")
      expect(entry.opts.symbol).to.equal("warning")
    })
  })
})
