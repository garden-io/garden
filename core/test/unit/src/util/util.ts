/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { describe } from "mocha"
import { includes } from "lodash-es"
import {
  pickKeys,
  getEnvVarName,
  exec,
  createOutputStream,
  spawn,
  relationshipClasses,
  isValidDateInstance,
} from "../../../../src/util/util.js"
import { expectError } from "../../../helpers.js"
import { getRootLogger } from "../../../../src/logger/logger.js"
import { dedent } from "../../../../src/util/string.js"
import { safeDumpYaml } from "../../../../src/util/serialization.js"
import { ChildProcessError } from "../../../../src/exceptions.js"

function isLinuxOrDarwin() {
  return process.platform === "darwin" || process.platform === "linux"
}

describe("util", () => {
  describe("exec", () => {
    before(function () {
      // These tests depend the underlying OS and are only executed on macOS and linux
      if (!isLinuxOrDarwin()) {
        // eslint-disable-next-line no-invalid-this
        this.skip()
      }
    })

    it("should successfully execute a command", async () => {
      const res = await exec("echo", ["hello"])
      expect(res.stdout).to.equal("hello")
    })

    it("should handle command and args in a single string", async () => {
      const res = await exec("echo hello && echo world", [], { shell: true })
      expect(res.stdout).to.equal("hello\nworld")
    })

    it("should optionally pipe stdout to an output stream", async () => {
      const logger = getRootLogger()
      logger.entries = []
      const log = logger.createLog()

      await exec("echo", ["hello"], { stdout: createOutputStream(log) })

      expect(logger.getLatestEntry().msg).to.equal("hello")
    })

    it("should optionally pipe stderr to an output stream", async () => {
      const logger = getRootLogger()
      logger.entries = []
      const log = logger.createLog()

      await exec("sh", ["-c", "echo hello 1>&2"], { stderr: createOutputStream(log) })

      expect(logger.getLatestEntry().msg).to.equal("hello")
    })

    it("should buffer outputs when piping to stream", async () => {
      const logger = getRootLogger()
      const log = logger.createLog()

      const res = await exec("echo", ["hello"], { stdout: createOutputStream(log) })

      expect(res.stdout).to.equal("hello")
    })

    it("should throw a standardised error message on error", async () => {
      await expectError(
        async () => {
          await exec(`sh -c "echo hello error; exit 1"`, [], { shell: true })
        },
        (err: ChildProcessError) => {
          expect(err).to.be.an.instanceOf(ChildProcessError)
          expect(err.details.code).to.eql(1)
          expect(err.details.cmd).to.eql(`sh -c "echo hello error; exit 1"`)
          expect(err.details.args).to.eql([])
          expect(err.details.output).to.eql("hello error")
          expect(err.details.stdout).to.eql("hello error")
          expect(err.details.stderr).to.eql("")
        }
      )
    })
  })

  describe("spawn", () => {
    before(function () {
      // These tests depend on the underlying OS and are only executed on macOS and linux
      if (!isLinuxOrDarwin()) {
        // eslint-disable-next-line no-invalid-this
        this.skip()
      }
    })
    it("should throw a standardised error message on error", async () => {
      await expectError(
        async () => {
          await spawn("ls", ["scottiepippen"])
        },
        (err: ChildProcessError) => {
          expect(err).to.be.an.instanceOf(ChildProcessError)
          // We're not using "sh -c" here since the output is not added to stdout|stderr if `tty: true` and
          // we therefore can't test the entire error message.
          if (process.platform === "darwin") {
            expect(err.details).to.eql({
              code: 1,
              cmd: "ls",
              args: ["scottiepippen"],
              opts: {},
              output: "ls: scottiepippen: No such file or directory\n",
              stderr: "ls: scottiepippen: No such file or directory\n",
              stdout: "",
            })
          } else {
            expect(err.details).to.eql({
              code: 2,
              cmd: "ls",
              args: ["scottiepippen"],
              opts: {},
              output: "ls: cannot access 'scottiepippen': No such file or directory\n",
              stderr: "ls: cannot access 'scottiepippen': No such file or directory\n",
              stdout: "",
            })
          }
        }
      )
    })
  })

  describe("getEnvVarName", () => {
    it("should translate the service name to a name appropriate for env variables", async () => {
      expect(getEnvVarName("service-b")).to.equal("SERVICE_B")
    })
  })

  describe("pickKeys", () => {
    it("should pick keys from an object", () => {
      const obj = { a: 1, b: 2, c: 3 }
      expect(pickKeys(obj, ["a", "b"])).to.eql({ a: 1, b: 2 })
    })

    it("should throw if one or more keys are missing", async () => {
      const obj = { a: 1, b: 2, c: 3 } as Record<string, number>
      await expectError(
        () => pickKeys(obj, ["a", "foo", "bar"]),
        (err) => {
          expect(err.message).to.equal("Could not find key(s): foo, bar. Available: a, b and c")
        }
      )
    })

    it("should use given description in error message", async () => {
      const obj = { a: 1, b: 2, c: 3 } as Record<string, number>
      await expectError(() => pickKeys(obj, ["a", "foo", "bar"], "banana"), {
        contains: "Could not find banana(s): foo, bar",
      })
    })
  })

  describe("relationshipClasses", () => {
    it("should correctly partition related items", () => {
      const items = ["a", "b", "c", "d", "e", "f", "g", "ab", "bc", "cd", "de", "fg"]
      const isRelated = (s1: string, s2: string) => includes(s1, s2) || includes(s2, s1)
      // There's no "ef" element, so ["f", "fg", "g"] should be disjoint from the rest.
      expect(relationshipClasses(items, isRelated)).to.eql([
        ["a", "ab", "b", "bc", "c", "cd", "d", "de", "e"],
        ["f", "fg", "g"],
      ])
    })

    it("should return a single partition when only one item is passed", () => {
      const isRelated = (s1: string, s2: string) => s1[0] === s2[0]
      expect(relationshipClasses(["a"], isRelated)).to.eql([["a"]])
    })
  })

  describe("safeDumpYaml", () => {
    it("should exclude invalid values from resulting YAML", () => {
      const json = {
        foo: {
          a: "a",
          fn: () => {},
          deep: {
            undf: undefined,
            b: "b",
            deeper: {
              date: new Date("2020-01-01"),
              fn: () => {},
              c: "c",
            },
          },
          undf: undefined,
          d: "d",
        },
      }
      expect(safeDumpYaml(json)).to.eql(dedent`
      foo:
        a: a
        deep:
          b: b
          deeper:
            date: 2020-01-01T00:00:00.000Z
            c: c
        d: d\n
      `)
    })
  })
  describe("isValidDateInstance", () => {
    it("should validate a date instance and return the instance or undefined", () => {
      const validA = new Date()
      const validB = new Date("2023-02-01T19:46:42.266Z")
      const validC = new Date(1675280826163)

      // Tricking the compiler. We need to test for this because
      // date strings can be created from runtime values that we don't validate.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const undef = undefined as any
      const invalidA = new Date(undef)
      const invalidB = new Date("foo")
      const invalidC = new Date("")

      expect(isValidDateInstance(validA)).to.be.true
      expect(isValidDateInstance(validB)).to.be.true
      expect(isValidDateInstance(validC)).to.be.true

      expect(isValidDateInstance(invalidA)).to.be.false
      expect(isValidDateInstance(invalidB)).to.be.false
      expect(isValidDateInstance(invalidC)).to.be.false
    })
  })
})
