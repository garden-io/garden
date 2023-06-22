/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { GardenBaseError, GardenErrorStackTrace, RuntimeError, getStackTraceMetadata } from "../../../src/exceptions"

describe("GardenError", () => {
  it("should return stack trace metadata", async () => {
    let error: GardenBaseError

    try {
      throw new RuntimeError("test exception", {})
    } catch (err) {
      error = err
    }

    const metadata = getStackTraceMetadata(error)

    const expected: GardenErrorStackTrace = { relativeFileName: "exceptions.ts", functionName: "Context.<anonymous>" }
    expect(metadata).to.eql(expected)
  })

  it("should handle empty stack trace", async () => {
    const error = new RuntimeError("test exception", {})

    error.stack = ""
    const metadataEmpty = getStackTraceMetadata(error)
    expect(metadataEmpty).to.eql(undefined)
  })

  it("should filter out source file in src path", async () => {
    const error = new RuntimeError("test exception", {})

    error.stack = `Error: test exception
    at Context.<anonymous> (/path/to/src/utils/exceptions.ts:17:13)
    at Test.Runnable.run (/path/to/node_modules/mocha/lib/runnable.js:354:5)
    at processImmediate (node:internal/timers:471:21)`

    const metadataSrc = getStackTraceMetadata(error)
    expect(metadataSrc).to.eql({ relativeFileName: "utils/exceptions.ts", functionName: "Context.<anonymous>" })
  })

  it("should filter out source file in node_modules path", async () => {
    const error = new RuntimeError("test exception", {})

    error.stack = `Error: test exception
    at Test.Runnable.run (/path/to/node_modules/mocha/lib/runnable.js:354:5)
    at processImmediate (node:internal/timers:471:21)`

    const metadataSrc = getStackTraceMetadata(error)
    expect(metadataSrc).to.eql({ relativeFileName: "mocha/lib/runnable.js", functionName: "Test.Runnable.run" })
  })

  it("should exclude relative filename if there is not match", async () => {
    const error = new RuntimeError("test exception", {})

    error.stack = `Error: test exception
    at processImmediate (node:internal/timers:471:21)`

    const metadataSrc = getStackTraceMetadata(error)
    expect(metadataSrc).to.eql({ relativeFileName: undefined, functionName: "processImmediate" })
  })
})
