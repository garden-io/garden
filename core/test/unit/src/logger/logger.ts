/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"

import { getLogger, Logger, LogLevel, sanitizeValue } from "../../../../src/logger/logger"
import { LogEntryEventPayload } from "../../../../src/cloud/buffered-event-stream"
import { freezeTime, projectRootA } from "../../../helpers"
import { makeDummyGarden } from "../../../../src/cli/cli"
import { joi } from "../../../../src/config/common"
import { LogEntry } from "../../../../src/logger/log-entry"

const logger: Logger = getLogger()

describe("Logger", () => {
  beforeEach(() => {
    logger["children"] = []
  })

  describe("events", () => {
    let loggerEvents: LogEntryEventPayload[] = []
    let listener = (event: LogEntryEventPayload) => loggerEvents.push(event)

    before(() => logger.events.on("logEntry", listener))
    after(() => logger.events.off("logEntry", listener))

    beforeEach(() => {
      loggerEvents = []
    })

    describe("onGraphChange", () => {
      it("should emit a loggerEvent event when an entry is created", () => {
        const now = freezeTime()
        const log = logger.info({
          msg: "hello",
          emoji: "admission_tickets",
          status: "active",
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
        const e = loggerEvents[0]
        expect(loggerEvents.length).to.eql(1)
        expect(e).to.eql({
          key: log.key,
          parentKey: null,
          revision: 0,
          timestamp: now,
          level: 2,
          message: {
            msg: "hello",
            emoji: "admission_tickets",
            status: "active",
            section: "80",
            symbol: "info",
            append: true,
            dataFormat: "json",
            data: { foo: "bar" },
          },
          metadata: {
            workflowStep: {
              index: 2,
            },
          },
        })
      })
      it("should include parent key on nested entries", () => {
        const now = freezeTime()
        const log = logger.info("hello")
        const nested = log.warn("world")
        const emptyMsg = {
          emoji: undefined,
          status: undefined,
          section: undefined,
          symbol: undefined,
          append: undefined,
          dataFormat: undefined,
          data: undefined,
        }

        const [e1, e2] = loggerEvents
        expect(loggerEvents.length).to.eql(2)
        expect(e1).to.eql({
          key: log.key,
          parentKey: null,
          revision: 0,
          timestamp: now,
          level: 2,
          message: {
            ...emptyMsg,
            msg: "hello",
          },
          metadata: undefined,
        })
        expect(e2).to.eql({
          key: nested.key,
          parentKey: log.key,
          revision: 0,
          timestamp: now,
          level: 1,
          message: {
            ...emptyMsg,
            msg: "world",
          },
          metadata: undefined,
        })
      })
      it("should emit a loggerEvent with a bumped revision when an entry is updated", () => {
        const log = logger.info({ msg: "0" })
        log.setState("1")
        logger.info({ msg: "0" })
        const [e1, e2, e3] = loggerEvents
        expect(loggerEvents.length).to.eql(3)
        expect(e1.revision).to.eql(0)
        expect(e2.revision).to.eql(1)
        expect(e3.revision).to.eql(0)
      })
      it("should not emit a loggerEvent for placeholder log entries", () => {
        logger.placeholder()
        expect(loggerEvents.length).to.eql(0)
      })
      it("should emit a loggerEvent when a placeholder entry is updated", () => {
        const log = logger.placeholder()
        expect(loggerEvents.length).to.eql(0)

        logger.info({ msg: "1" })
        log.setState("2")

        const [e1, e2] = loggerEvents
        expect(loggerEvents.length).to.eql(2)
        expect(e1.message.msg).to.eql("1")
        expect(e2.message.msg).to.eql("2")
      })
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
    })
    it("should not store entires if storeEntries=false", () => {
      const loggerB = new Logger({
        level: LogLevel.info,
        writers: [],
        storeEntries: false,
      })

      loggerB.error("error")
      loggerB.warn("warn")
      const entry = loggerB.info("info")
      loggerB.verbose("verbose")
      loggerB.debug("debug")
      loggerB.silly("silly")

      const nested = entry.info("nested")
      const deepNested = nested.info("deep")

      expect(logger.children).to.eql([])
      expect(entry.children).to.eql([])
      expect(nested.children).to.eql([])
      expect(deepNested.children).to.eql([])
    })
  })
  describe("findById", () => {
    it("should return the first log entry with a matching id and undefined otherwise", () => {
      logger.info({ msg: "0" })
      logger.info({ msg: "a1", id: "a" })
      logger.info({ msg: "a2", id: "a" })
      expect(logger.findById("a")["messages"][0]["msg"]).to.eql("a1")
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
      expect(s1.map((entry) => entry.id)).to.eql(["a", "b"])
      expect(sEmpty).to.eql([])
    })
  })

  describe("getLogEntries", () => {
    it("should return an ordered list of log entries", () => {
      logger.error("error")
      logger.warn("warn")
      logger.info("info")
      logger.verbose("verbose")
      logger.debug("debug")
      logger.silly("silly")

      const entries = logger.getLogEntries()
      const levels = entries.map((e) => e.level)

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

  describe("sanitizeValue", () => {
    it("replaces Buffer instances", () => {
      const obj = {
        a: Buffer.from([0, 1, 2, 3]),
      }
      const res = sanitizeValue(obj)
      expect(res).to.eql({
        a: "<Buffer>",
      })
    })

    it("replaces nested values", () => {
      const obj = {
        a: {
          b: Buffer.from([0, 1, 2, 3]),
        },
      }
      const res = sanitizeValue(obj)
      expect(res).to.eql({
        a: { b: "<Buffer>" },
      })
    })

    it("replaces attributes on a class instance", () => {
      class Foo {
        b: Buffer

        constructor() {
          this.b = Buffer.from([0, 1, 2, 3])
        }
      }
      const obj = {
        a: new Foo(),
      }
      const res = sanitizeValue(obj)
      expect(res).to.eql({
        a: { b: "<Buffer>" },
      })
    })

    it("replaces nested values on class attributes", () => {
      class Foo {
        b: any

        constructor() {
          this.b = { c: Buffer.from([0, 1, 2, 3]) }
        }
      }
      const obj = {
        a: new Foo(),
      }
      const res = sanitizeValue(obj)
      expect(res).to.eql({
        a: { b: { c: "<Buffer>" } },
      })
    })

    it("replaces nested values in an array", () => {
      const obj = {
        a: {
          b: [Buffer.from([0, 1, 2, 3])],
        },
      }
      const res = sanitizeValue(obj)
      expect(res).to.eql({
        a: { b: ["<Buffer>"] },
      })
    })

    it("replaces nested values in an object in an array", () => {
      const obj = {
        a: [
          {
            b: [Buffer.from([0, 1, 2, 3])],
          },
        ],
      }
      const res = sanitizeValue(obj)
      expect(res).to.eql({
        a: [{ b: ["<Buffer>"] }],
      })
    })

    it("replaces a circular reference", () => {
      const a = { b: <any>{} }
      a.b.a = a
      const res = sanitizeValue(a)
      expect(res).to.eql({ b: { a: "[Circular]" } })
    })

    it("replaces a circular reference nested in an array", () => {
      const a = [{ b: <any>{} }]
      a[0].b.a = a
      const res = sanitizeValue(a)
      expect(res).to.eql([{ b: { a: "[Circular]" } }])
    })

    it("replaces a circular reference nested under a class attribute", () => {
      class Foo {
        a: any
      }

      const a = [{ b: new Foo() }]
      a[0].b.a = a
      const res = sanitizeValue(a)
      expect(res).to.eql([{ b: { a: "[Circular]" } }])
    })

    it("replaces Garden instances", async () => {
      const obj = {
        a: await makeDummyGarden(projectRootA, { commandInfo: { name: "foo", args: {}, opts: {} } }),
      }
      const res = sanitizeValue(obj)
      expect(res).to.eql({
        a: "<Garden>",
      })
    })

    it("replaces LogEntry instances", async () => {
      const obj = {
        a: logger.info("foo"),
      }
      const res = sanitizeValue(obj)
      expect(res).to.eql({
        a: "<LogEntry>",
      })
    })

    it("calls sanitize method if present", async () => {
      class Foo {
        toSanitizedValue() {
          return "foo"
        }
      }
      const obj = {
        a: new Foo(),
      }
      const res = sanitizeValue(obj)
      expect(res).to.eql({
        a: "foo",
      })
    })

    it("replaces LogEntry instance on a class instance", async () => {
      class Foo {
        log: LogEntry

        constructor() {
          this.log = logger.info("foo")
        }
      }

      const obj = {
        a: new Foo(),
      }
      const res = sanitizeValue(obj)
      expect(res).to.eql({
        a: { log: "<LogEntry>" },
      })
    })

    it("replaces joi schemas", async () => {
      const obj = {
        a: joi.object(),
      }
      const res = sanitizeValue(obj)
      expect(res).to.eql({
        a: "<JoiSchema>",
      })
    })
  })
})
