/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"

import { getLogger, Logger } from "../../../../src/logger/logger"
import { freezeTime } from "../../../helpers"
import { LogEntryMetadata, TaskMetadata } from "../../../../src/logger/log-entry"

const logger: Logger = getLogger()

beforeEach(() => {
  // tslint:disable-next-line: prettier
  (logger["children"] as any) = []
})

describe("LogEntry", () => {
  const emptyState = {
    msg: undefined,
    emoji: undefined,
    section: undefined,
    symbol: undefined,
    status: undefined,
    data: undefined,
    dataFormat: undefined,
    append: undefined,
  }
  it("should create log entries with the appropriate fields set", () => {
    const timestamp = freezeTime()
    const entry = logger.info({
      id: "my-id",
      msg: "hello",
      emoji: "alien",
      status: "error",
      section: "80",
      symbol: "info",
      append: true,
      data: { foo: "bar" },
      dataFormat: "json",
      metadata: {
        workflowStep: {
          index: 2,
        },
      },
    })
    expect(entry.getMetadata()).to.eql({
      workflowStep: {
        index: 2,
      },
    })
    expect(entry.getMessages()).to.eql([
      {
        msg: "hello",
        emoji: "alien",
        status: "error",
        section: "80",
        symbol: "info",
        append: true,
        data: { foo: "bar" },
        dataFormat: "json",
        timestamp,
      },
    ])
    expect(entry.isPlaceholder).to.be.false
    expect(entry.revision).to.eql(0)
    expect(entry.id).to.eql("my-id")
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
  context("placeholders", () => {
    it("should dedent placeholder log entries", () => {
      const ph1 = logger.placeholder()
      const ph2 = ph1.placeholder()
      const nonEmpty = ph1.info("foo")
      const nested = nonEmpty.info("foo")
      const nestedPh = nested.placeholder()
      const indents = [ph1.indent, ph2.indent, nonEmpty.indent, nested.indent, nestedPh.indent]
      expect(indents).to.eql([-1, -1, 0, 1, 0])
    })
    it("should initialize placeholders with an empty message and a timestamp", () => {
      const timestamp = freezeTime()
      const ph = logger.placeholder()
      expect(ph.isPlaceholder).to.be.true
      expect(ph.getMessages()).to.eql([{ timestamp }])
    })
    it("should correctly update placeholders", () => {
      const timestamp = freezeTime()
      const ph = logger.placeholder()
      const hello = ph.info("hello")
      ph.setState("world")
      expect(hello.getMessages()).to.eql([{ ...emptyState, timestamp, msg: "hello" }])
      expect(hello.isPlaceholder).to.be.false
      expect(ph.getMessages()).to.eql([{ ...emptyState, timestamp, msg: "world" }])
      expect(ph.isPlaceholder).to.be.false
    })
  })
  context("metadata", () => {
    const metadata: LogEntryMetadata = { workflowStep: { index: 1 } }
    it("should pass on any metadata to placeholder or child nodes", () => {
      const ph1 = logger.placeholder({ metadata })
      const ph2 = ph1.placeholder()
      const entry = logger.info({ msg: "hello", metadata })
      const ph3 = entry.placeholder()
      const nested = entry.info("nested")
      const entry2 = logger.info("hello")
      const ph4 = entry2.placeholder({ metadata })
      expect(ph1.getMetadata()).to.eql(metadata)
      expect(ph2.getMetadata()).to.eql(metadata)
      expect(ph3.getMetadata()).to.eql(metadata)
      expect(ph4.getMetadata()).to.eql(metadata)
      expect(entry.getMetadata()).to.eql(metadata)
      expect(entry2.getMetadata()).to.eql(undefined)
      expect(nested.getMetadata()).to.eql(metadata)
    })
    it("should not set metadata on parent when creating placeholders or child nodes", () => {
      const entry = logger.info("hello")
      const ph = entry.placeholder({ metadata })
      expect(entry.getMetadata()).to.eql(undefined)
      expect(ph.getMetadata()).to.eql(metadata)
    })
    it("should not set empty metadata objects on child entries", () => {
      const entry = logger.info("hello")
      const child = entry.info("world")
      expect(entry.getMetadata()).to.eql(undefined)
      expect(child.getMetadata()).to.eql(undefined)
    })
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
    it("should update entry state", () => {
      const timestamp = freezeTime()
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
      })

      expect(entry.getMessages()).to.eql([
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
        },
      ])
      expect(entry.getMetadata()).to.eql({ task: taskMetadata })
    })
    it("should overwrite previous values", () => {
      const timestamp = freezeTime()
      const entry = logger.placeholder()
      entry.setState({
        msg: "hello",
        emoji: "haircut",
        section: "caesar",
        symbol: "info",
        status: "done",
        data: { some: "data" },
      })
      entry.setState({
        msg: "world",
        emoji: "hamburger",
        data: { some: "data_updated" },
      })

      expect(entry.getMessages()).to.eql([
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
        },
      ])
    })
    it("should set the 'append' field separately for each message state", () => {
      const timestamp = freezeTime()
      const entry = logger.placeholder()

      entry.setState({ append: true })
      expect(entry.getMessages()).to.eql([{ ...emptyState, append: true, timestamp }])

      entry.setState({ msg: "boo" })
      expect(entry.getMessages()).to.eql([
        { ...emptyState, append: true, timestamp },
        { ...emptyState, append: undefined, msg: "boo", timestamp },
      ])

      entry.setState({ append: true })
      expect(entry.getMessages()).to.eql([
        { ...emptyState, append: true, timestamp },
        { ...emptyState, append: undefined, msg: "boo", timestamp },
        { ...emptyState, append: true, msg: "boo", timestamp },
      ])
    })
    it("should preserve status", () => {
      const entry = logger.info("")
      entry.setSuccess()
      entry.setState("change text")
      expect(entry.getLatestMessage().status).to.equal("success")
    })
    it("should set symbol to empty if entry has section and spinner disappears (to preserve alignment)", () => {
      const entry = logger.info({ status: "active", section: "foo" })
      entry.setState({ status: "error" })
      expect(entry.getLatestMessage().symbol).to.equal("empty")

      const newEntry = logger.info({
        status: "active",
        section: "foo",
        symbol: "info",
      })
      newEntry.setState({ status: "error" })
      expect(newEntry.getLatestMessage().symbol).to.equal("info")
    })
    it("should update the metadata property", () => {
      const timestamp = freezeTime()
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
      expect(entry.getMessages()).to.eql([{ ...emptyState, timestamp }])

      entry.setState({ metadata: { task: taskMetadataB } })
      expect(entry.getMetadata()).to.eql({ task: taskMetadataB })
      expect(entry.getMessages()).to.eql([
        { ...emptyState, timestamp },
        { ...emptyState, timestamp },
      ])
    })
  })
  describe("setDone", () => {
    it("should update entry state and set status to done", () => {
      const entry = logger.info("")
      entry.setDone()
      expect(entry.getLatestMessage().status).to.equal("done")
    })
  })
  describe("setSuccess", () => {
    it("should update entry state and set status and symbol to success", () => {
      const entry = logger.info("")
      entry.setSuccess()
      expect(entry.getLatestMessage().status).to.equal("success")
      expect(entry.getLatestMessage().symbol).to.equal("success")
    })
  })
  describe("setError", () => {
    it("should update entry state and set status and symbol to error", () => {
      const entry = logger.info("")
      entry.setError()
      expect(entry.getLatestMessage().status).to.equal("error")
      expect(entry.getLatestMessage().symbol).to.equal("error")
    })
  })
  describe("setWarn", () => {
    it("should update entry state and set status and symbol to warn", () => {
      const entry = logger.info("")
      entry.setWarn()
      expect(entry.getLatestMessage().status).to.equal("warn")
      expect(entry.getLatestMessage().symbol).to.equal("warning")
    })
  })
})
