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
})
