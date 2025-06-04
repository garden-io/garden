/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import type { GardenError, StackTraceMetadata } from "../../../src/exceptions.js"
import {
  ChildProcessError,
  ConfigurationError,
  RuntimeError,
  getStackTraceMetadata,
  isErrnoException,
} from "../../../src/exceptions.js"
import dedent from "dedent"
import { testFlags } from "../../../src/util/util.js"
import fsExtra from "fs-extra"
const { readFile } = fsExtra
import { resolve4 } from "dns/promises"
import dns from "node:dns"

describe("isErrnoException", async () => {
  it("should return true for file not found errors", async () => {
    let err: unknown

    try {
      await readFile("non-existent-file")
      expect.fail("should have thrown")
    } catch (e) {
      err = e
    }

    if (isErrnoException(err)) {
      expect(err.code).to.equal("ENOENT")
    } else {
      expect.fail("should have been an NodeJSErrnoException")
    }
  })

  it("should return true for DNS ENOTFOUND errors", async () => {
    let err: unknown

    try {
      await resolve4("non-existent-hostname")
      expect.fail("should have thrown")
    } catch (e) {
      err = e
    }

    if (isErrnoException(err)) {
      expect(err.code).to.equal(dns.NOTFOUND)
    } else {
      expect.fail("should have been an NodeJSErrnoException")
    }
  })

  it("should return false for other errors", () => {
    const err = new Error("test exception")
    expect(isErrnoException(err)).to.be.false
  })
})
describe("GardenError", () => {
  // helper to avoid dealing with changing line numbers
  const filterTrace = (metadata) => {
    return metadata.map((m) => {
      return {
        functionName: m.functionName,
        lineNumber: undefined,
        relativeFileName: m.relativeFileName,
      }
    })
  }

  it("should return stack trace metadata", async () => {
    let error: GardenError

    try {
      throw new RuntimeError({ message: "test exception" })
    } catch (err) {
      error = err as RuntimeError
    }

    const stackTrace = getStackTraceMetadata(error)

    const expectedSubset: StackTraceMetadata[] = [
      {
        relativeFileName: "exceptions.ts",
        lineNumber: undefined,
        functionName: "Context.<anonymous>",
      },
      {
        functionName: "Test.Runnable.run",
        lineNumber: undefined,
        relativeFileName: "mocha/lib/runnable.js",
      },
    ]

    expect(stackTrace).to.not.be.undefined

    // make sure we set line numbers
    // we avoid testing them in deep equals since they are not reliable for tests
    expect(stackTrace.metadata.at(0)).to.not.be.undefined
    expect(stackTrace.metadata.at(0)?.lineNumber).to.not.be.undefined

    expect(filterTrace(stackTrace.metadata)).to.deep.include.members(expectedSubset)
  })

  it("should handle empty stack trace", async () => {
    const error = new RuntimeError({ message: "test exception" })

    error.stack = ""
    const stackTrace = getStackTraceMetadata(error)
    expect(stackTrace).to.eql({ metadata: [], wrappedMetadata: undefined })
  })

  it("should return list of stack trace entries", async () => {
    const error = new RuntimeError({ message: "test exception" })

    error.stack = `Error: test exception
    at Context.<anonymous> (/path/to/src/utils/exceptions.ts:17:13)
    at Test.Runnable.run (/path/to/node_modules/mocha/lib/runnable.js:354:5)
    at processImmediate (node:internal/timers:471:21)`

    const stackTrace = getStackTraceMetadata(error)
    expect(filterTrace(stackTrace.metadata)).to.eql([
      { relativeFileName: "utils/exceptions.ts", lineNumber: undefined, functionName: "Context.<anonymous>" },
      { relativeFileName: "mocha/lib/runnable.js", lineNumber: undefined, functionName: "Test.Runnable.run" },
      { relativeFileName: "timers", lineNumber: undefined, functionName: "processImmediate" },
    ])
  })

  it("should return wrapped stack trace metadata", async () => {
    const wrappedError = new ConfigurationError({ message: "test exception" })
    wrappedError.stack = `Error: config exception
    at Context.<anonymous> (/path/to/src/utils/exceptions.ts:17:13)
    at Test.Runnable.run (/path/to/node_modules/mocha/lib/runnable.js:354:5)
    at processImmediate (node:internal/timers:471:21)`

    const error = new RuntimeError({ message: "test exception", wrappedErrors: [wrappedError] })

    const stackTrace = getStackTraceMetadata(error)

    expect(stackTrace.wrappedMetadata).to.have.length(1)
    expect(filterTrace(stackTrace.wrappedMetadata?.at(0))).to.eql([
      { relativeFileName: "utils/exceptions.ts", lineNumber: undefined, functionName: "Context.<anonymous>" },
      { relativeFileName: "mocha/lib/runnable.js", lineNumber: undefined, functionName: "Test.Runnable.run" },
      { relativeFileName: "timers", lineNumber: undefined, functionName: "processImmediate" },
    ])
  })

  it("should not expand error stack with wrapped errors trace by default", () => {
    testFlags.expandErrors = false

    const wrappedError = new ConfigurationError({ message: "wrapped error" })

    const error = new RuntimeError({ message: "test exception", wrappedErrors: [wrappedError] })

    expect(error.stack).to.contain("test exception")
    expect(error.stack).not.to.contain("wrapped error")
  })

  it("should expand error stack with wrapped errors trace if testFlags.expandErrors is true", () => {
    testFlags.expandErrors = true

    const wrappedError = new ConfigurationError({ message: "wrapped error" })

    const error = new RuntimeError({ message: "test exception", wrappedErrors: [wrappedError] })

    expect(error.stack).to.contain("test exception")
    expect(error.stack).to.contain("wrapped error")
  })

  it("should format expanded errors correctly", () => {
    testFlags.expandErrors = true

    const error1 = new RuntimeError({
      message: "test exception",
      wrappedErrors: [
        new ConfigurationError({ message: "wrapped error one" }),
        new ConfigurationError({ message: "wrapped error two" }),
      ],
    })

    expect(error1.stack?.replaceAll(/at .+$/gm, "at (stack trace)")).to.eql(dedent`
      Error: test exception
          at (stack trace)
          at (stack trace)
          at (stack trace)
          at (stack trace)
          at (stack trace)
          at (stack trace)
          at (stack trace)
          at (stack trace)
          at (stack trace)
          at (stack trace)
      Wrapped errors:
      ⮑  Error: wrapped error one
              at (stack trace)
              at (stack trace)
              at (stack trace)
              at (stack trace)
              at (stack trace)
              at (stack trace)
              at (stack trace)
              at (stack trace)
              at (stack trace)
              at (stack trace)
          Error type: configuration
      ⮑  Error: wrapped error two
              at (stack trace)
              at (stack trace)
              at (stack trace)
              at (stack trace)
              at (stack trace)
              at (stack trace)
              at (stack trace)
              at (stack trace)
              at (stack trace)
              at (stack trace)
          Error type: configuration`)

    const error2 = new RuntimeError({
      message: "test exception",
      wrappedErrors: [
        new ConfigurationError({
          message: "wrapped error one",
          wrappedErrors: [new ConfigurationError({ message: "wrapped error two" })],
        }),
      ],
    })

    expect(error2.stack?.replaceAll(/at .+$/gm, "at (stack trace)")).to.eql(dedent`
      Error: test exception
          at (stack trace)
          at (stack trace)
          at (stack trace)
          at (stack trace)
          at (stack trace)
          at (stack trace)
          at (stack trace)
          at (stack trace)
          at (stack trace)
          at (stack trace)
      Wrapped errors:
      ⮑  Error: wrapped error one
              at (stack trace)
              at (stack trace)
              at (stack trace)
              at (stack trace)
              at (stack trace)
              at (stack trace)
              at (stack trace)
              at (stack trace)
              at (stack trace)
              at (stack trace)
          Error type: configuration
          Wrapped errors:
          ⮑  Error: wrapped error two
                  at (stack trace)
                  at (stack trace)
                  at (stack trace)
                  at (stack trace)
                  at (stack trace)
                  at (stack trace)
                  at (stack trace)
                  at (stack trace)
                  at (stack trace)
                  at (stack trace)
              Error type: configuration`)
  })

  afterEach(() => {
    // restore testFlag to default value
    testFlags.expandErrors = true
  })
})

describe("ChildProcessError", () => {
  it("formats an appropriate error message", () => {
    const err = new ChildProcessError({
      code: 1,
      cmd: "ls",
      args: ["some-dir"],
      stderr: "dir not found",
      stdout: "",
      output: "dir not found",
    })
    expect(err.message).to.equal(dedent`
      Command "ls some-dir" failed with code 1:

      dir not found
    `)
  })
  it("should ignore emtpy args", () => {
    const err = new ChildProcessError({
      code: 1,
      cmd: "ls",
      args: [],
      stderr: "dir not found",
      stdout: "",
      output: "dir not found",
    })
    expect(err.message).to.equal(dedent`
      Command "ls" failed with code 1:

      dir not found
    `)
  })
  it("should include output if it's not the same as the error", () => {
    const err = new ChildProcessError({
      code: 1,
      cmd: "ls some-dir",
      args: [],
      stderr: "dir not found",
      stdout: " and some more output",
      output: "dir not found and some more output",
    })
    expect(err.message).to.equal(dedent`
      Command "ls some-dir" failed with code 1:

      dir not found

      Here's the full output:

      dir not found and some more output
    `)
  })
  it("should include the last 100 lines of output if output is very long", () => {
    const output = "All work and no play\n"
    const outputFull = output.repeat(102)
    const outputPartial = output.repeat(99) // This makes 100 lines in total

    const err = new ChildProcessError({
      code: 1,
      cmd: "ls some-dir",
      args: [],
      stderr: "dir not found",
      stdout: outputFull,
      output: outputFull,
    })
    expect(err.message).to.equal(dedent`
      Command "ls some-dir" failed with code 1:

      dir not found

      Here are the last 100 lines of the output:

      ${outputPartial}
    `)
  })
})
