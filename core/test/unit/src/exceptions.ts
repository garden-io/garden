/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import {
  ConfigurationError,
  GardenError,
  RuntimeError,
  StackTraceMetadata,
  getStackTraceMetadata,
} from "../../../src/exceptions"

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
      error = err
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
})
