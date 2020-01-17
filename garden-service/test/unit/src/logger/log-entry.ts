import { expect } from "chai"

import { getLogger } from "../../../../src/logger/logger"
import { freezeTime } from "../../../helpers"
import { TaskMetadata } from "../../../../src/logger/log-entry"

const logger: any = getLogger()

beforeEach(() => {
  logger.children = []
})

describe("LogEntry", () => {
  it("should dedent placeholder log entries", () => {
    const ph1 = logger.placeholder()
    const ph2 = ph1.placeholder()
    const nonEmpty = ph1.info("foo")
    const nested = nonEmpty.info("foo")
    const nestedPh = nested.placeholder()
    const indents = [ph1.indent, ph2.indent, nonEmpty.indent, nested.indent, nestedPh.indent]
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
      entry.indent,
      nested.indent,
      deepNested.indent,
      deepDeepNested.indent,
      deepDeepPh.indent,
      deepDeepNested2.indent,
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
    const emptyState = {
      msg: undefined,
      emoji: undefined,
      section: undefined,
      symbol: undefined,
      status: undefined,
      data: undefined,
      dataFormat: undefined,
      append: undefined,
      maxSectionWidth: undefined,
    }
    it("should update entry state", () => {
      const timestamp = freezeTime().valueOf()
      const taskMetadata: TaskMetadata = {
        type: "a",
        key: "a",
        status: "active",
        uid: "1",
        versionString: "123",
      }
      const entry = logger.placeholder()
      entry.setState({
        msg: "hello",
        emoji: "haircut",
        section: "caesar",
        symbol: "info",
        status: "done",
        data: { some: "data" },
        dataFormat: "json",
        metadata: { task: taskMetadata },
        maxSectionWidth: 8,
      })

      expect(entry.getMessageStates()).to.eql([
        {
          msg: "hello",
          emoji: "haircut",
          section: "caesar",
          symbol: "info",
          status: "done",
          data: { some: "data" },
          dataFormat: "json",
          append: undefined,
          timestamp,
          maxSectionWidth: 8,
        },
      ])
      expect(entry.getMetadata()).to.eql({ task: taskMetadata })
    })
    it("should update maxSectionWidth to zero", () => {
      const timestamp = freezeTime().valueOf()
      const entry = logger.placeholder()
      entry.setState({
        msg: "hello",
        emoji: "haircut",
        section: "caesar",
        symbol: "info",
        status: "done",
        data: { some: "data" },
        maxSectionWidth: 0,
      })

      expect(entry.getMessageStates()).to.eql([
        {
          msg: "hello",
          emoji: "haircut",
          section: "caesar",
          symbol: "info",
          status: "done",
          data: { some: "data" },
          dataFormat: undefined,
          append: undefined,
          timestamp,
          maxSectionWidth: 0,
        },
      ])
    })
    it("should overwrite previous values", () => {
      const timestamp = freezeTime().valueOf()
      const entry = logger.placeholder()
      entry.setState({
        msg: "hello",
        emoji: "haircut",
        section: "caesar",
        symbol: "info",
        status: "done",
        data: { some: "data" },
        maxSectionWidth: 8,
      })
      entry.setState({
        msg: "world",
        emoji: "hamburger",
        data: { some: "data_updated" },
        maxSectionWidth: 10,
      })

      entry.setState({
        maxSectionWidth: 0,
      })
      expect(entry.getMessageStates()).to.eql([
        {
          msg: "hello",
          emoji: "haircut",
          section: "caesar",
          symbol: "info",
          status: "done",
          data: { some: "data" },
          dataFormat: undefined,
          append: undefined,
          timestamp,
          maxSectionWidth: 8,
        },
        {
          msg: "world",
          emoji: "hamburger",
          section: "caesar",
          symbol: "info",
          status: "done",
          data: { some: "data_updated" },
          dataFormat: undefined,
          append: undefined,
          timestamp,
          maxSectionWidth: 10,
        },
        {
          msg: "world",
          emoji: "hamburger",
          section: "caesar",
          symbol: "info",
          status: "done",
          data: { some: "data_updated" },
          dataFormat: undefined,
          append: undefined,
          timestamp,
          maxSectionWidth: 0,
        },
      ])
    })
    it("should set the 'append' field separately for each message state", () => {
      const timestamp = freezeTime().valueOf()
      const entry = logger.placeholder()

      entry.setState({ append: true })
      expect(entry.getMessageStates()).to.eql([{ ...emptyState, append: true, timestamp }])

      entry.setState({ msg: "boo" })
      expect(entry.getMessageStates()).to.eql([
        { ...emptyState, append: true, timestamp },
        { ...emptyState, append: undefined, msg: "boo", timestamp },
      ])

      entry.setState({ append: true })
      expect(entry.getMessageStates()).to.eql([
        { ...emptyState, append: true, timestamp },
        { ...emptyState, append: undefined, msg: "boo", timestamp },
        { ...emptyState, append: true, msg: "boo", timestamp },
      ])
    })
    it("should preserve status", () => {
      const entry = logger.info("")
      entry.setSuccess()
      entry.setState("change text")
      expect(entry.getMessageState().status).to.equal("success")
    })
    it("should set symbol to empty if entry has section and spinner disappears (to preserve alignment)", () => {
      const entry = logger.info({ status: "active", section: "foo" })
      entry.setState({ status: "error" })
      expect(entry.getMessageState().symbol).to.equal("empty")

      const newEntry = logger.info({
        status: "active",
        section: "foo",
        symbol: "info",
      })
      newEntry.setState({ status: "error" })
      expect(newEntry.getMessageState().symbol).to.equal("info")
    })
    it("should update the metadata property", () => {
      const timestamp = freezeTime().valueOf()
      const taskMetadataA: TaskMetadata = {
        type: "a",
        key: "a",
        status: "active",
        uid: "1",
        versionString: "123",
      }
      const taskMetadataB: TaskMetadata = {
        ...taskMetadataA,
        status: "error",
      }
      const entry = logger.placeholder()
      entry.setState({ metadata: { task: taskMetadataA } })
      expect(entry.getMetadata()).to.eql({ task: taskMetadataA })
      // Message states should not change
      expect(entry.getMessageStates()).to.eql([{ ...emptyState, timestamp }])

      entry.setState({ metadata: { task: taskMetadataB } })
      expect(entry.getMetadata()).to.eql({ task: taskMetadataB })
      expect(entry.getMessageStates()).to.eql([
        { ...emptyState, timestamp },
        { ...emptyState, timestamp },
      ])
    })
  })
  describe("setDone", () => {
    it("should update entry state and set status to done", () => {
      const entry = logger.info("")
      entry.setDone()
      expect(entry.getMessageState().status).to.equal("done")
    })
  })
  describe("setSuccess", () => {
    it("should update entry state and set status and symbol to success", () => {
      const entry = logger.info("")
      entry.setSuccess()
      expect(entry.getMessageState().status).to.equal("success")
      expect(entry.getMessageState().symbol).to.equal("success")
    })
  })
  describe("setError", () => {
    it("should update entry state and set status and symbol to error", () => {
      const entry = logger.info("")
      entry.setError()
      expect(entry.getMessageState().status).to.equal("error")
      expect(entry.getMessageState().symbol).to.equal("error")
    })
  })
  describe("setWarn", () => {
    it("should update entry state and set status and symbol to warn", () => {
      const entry = logger.info("")
      entry.setWarn()
      expect(entry.getMessageState().status).to.equal("warn")
      expect(entry.getMessageState().symbol).to.equal("warning")
    })
  })
})
