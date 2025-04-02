/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { enumerate } from "../../../../src/util/enumerate.js"
import { expect } from "chai"

describe("enumerate", () => {
  const list = ["a", "b", "c"]
  it("counts from 0 if no start parameter defined", () => {
    const enumeratedArray = Array.from(enumerate(list))
    expect(enumeratedArray).to.deep.equal([
      [0, "a"],
      [1, "b"],
      [2, "c"],
    ])
  })

  it("counts from custom start value if it's defined", () => {
    const start = 5
    let counter = start
    const enumeratedArray = Array.from(enumerate(list, start))
    expect(enumeratedArray).to.deep.equal([
      [counter++, "a"],
      [counter++, "b"],
      [counter, "c"],
    ])
  })

  it("returns empty array for empty input", () => {
    const enumeratedArray = Array.from(enumerate([]))
    expect(enumeratedArray).to.deep.equal([])
  })
})
