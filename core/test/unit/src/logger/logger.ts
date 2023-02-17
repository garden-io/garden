/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"

import { getLogger, Logger, LogLevel } from "../../../../src/logger/logger"
import { LogEntryEventPayload } from "../../../../src/cloud/buffered-event-stream"
import { freezeTime, projectRootA } from "../../../helpers"
import { makeDummyGarden } from "../../../../src/cli/cli"
import { joi } from "../../../../src/config/common"
import { Log } from "../../../../src/logger/log-entry"
import { sanitizeValue } from "../../../../src/logger/util"

const logger: Logger = getLogger()

describe("Logger", () => {
  beforeEach(() => {
    logger["entries"] = []
  })

  describe("events", () => {
    let logWriterEvents: LogEntryEventPayload[] = []
    let listener = (event: LogEntryEventPayload) => logWriterEvents.push(event)

    before(() => logger.events.on("logEntry", listener))
    after(() => logger.events.off("logEntry", listener))

    beforeEach(() => {
      logWriterEvents = []
    })

    describe("log", () => {
      it("should emit a loggerEvent event when an entry is created", () => {
        const now = freezeTime()
        const log = logger.makeNewLogContext()
        log.info({
          msg: "hello",
          section: "80",
          symbol: "info",
          data: { foo: "bar" },
          dataFormat: "json",
          metadata: {
            workflowStep: {
              index: 2,
            },
          },
        })
        const e = logWriterEvents[0]
        expect(logWriterEvents.length).to.eql(1)
        expect(e).to.eql({
          key: e.key,
          timestamp: now.toISOString(),
          level: 2,
          message: {
            msg: "hello",
            section: "80",
            symbol: "info",
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
    })
  })
  describe("log", () => {
    it("should collect entries if storeEntries=true", () => {
      const log = logger.makeNewLogContext()
      log.error("error")
      log.warn("warn")
      log.info("info")
      log.verbose("verbose")
      log.debug("debug")
      log.silly("silly")

      expect(logger.entries).to.have.lengthOf(6)
      const messages = logger.entries.map((e) => e.msg)
      expect(messages).to.eql(["error", "warn", "info", "verbose", "debug", "silly"])
    })
    it("should not store entires if storeEntries=false", () => {
      const logWriterB = new Logger({
        level: LogLevel.info,
        writers: [],
        storeEntries: false,
      })
      const log = logWriterB.makeNewLogContext()

      log.error("error")
      log.warn("warn")
      log.verbose("verbose")
      log.debug("debug")
      log.silly("silly")

      expect(logger.entries).to.eql([])
    })
  })
  describe("findById", () => {
    it("should return the first log entry with a matching id and undefined otherwise", () => {
      const log = logger.makeNewLogContext()
      log.info({ msg: "0" })
      log.info({ msg: "a1", id: "a" })
      log.info({ msg: "a2", id: "a" })
      expect(logger.findById("a")?.msg).to.eql("a1")
      expect(logger.findById("z")).to.be.undefined
    })
  })

  describe("filterBySection", () => {
    it("should return an array of all entries with the matching section name", () => {
      const log = logger.makeNewLogContext()
      log.info({ section: "s0" })
      log.info({ section: "s1", id: "a" })
      log.info({ section: "s2" })
      log.info({ section: "s1", id: "b" })
      const s1 = logger.filterBySection("s1")
      const sEmpty = logger.filterBySection("s99")
      expect(s1.map((entry) => entry.id)).to.eql(["a", "b"])
      expect(sEmpty).to.eql([])
    })
  })

  describe("getLogEntries", () => {
    it("should return the list of log entries", () => {
      const log = logger.makeNewLogContext()
      log.error("error")
      log.warn("warn")
      log.info("info")
      log.verbose("verbose")
      log.debug("debug")
      log.silly("silly")

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
      const log = logger.makeNewLogContext().info("foo")
      const obj = {
        a: log,
      }
      const res = sanitizeValue(obj)
      expect(res).to.eql({
        a: "<Log>",
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
        log: Log

        constructor() {
          const log = logger.makeNewLogContext().info("foo")
          this.log = log
        }
      }

      const obj = {
        a: new Foo(),
      }
      const res = sanitizeValue(obj)
      expect(res).to.eql({
        a: { log: "<Log>" },
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
