/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { customMinimist } from "../../../../src/lib/minimist.js"

describe("customMinimist", () => {
  it("collects unspecified options and arguments to _unknown", () => {
    const args = ["pos-a", "pos-b", "--defined", "123", "--undefined", "foo", "--a=b"]
    const parsed = customMinimist(args, { string: ["defined"] })
    expect(parsed._unknown).to.eql(["pos-a", "pos-b", "--undefined", "foo", "--a=b"])
  })
})
