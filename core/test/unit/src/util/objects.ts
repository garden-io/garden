/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { deepFilter, deepOmitUndefined } from "../../../../src/util/objects.js"

describe("deepFilter", () => {
  const fn = (v) => v !== 99

  it("should filter keys in a simple object", () => {
    const obj = {
      a: 1,
      b: 2,
      c: 99,
    }
    expect(deepFilter(obj, fn)).to.eql({ a: 1, b: 2 })
  })

  it("should filter keys in a nested object", () => {
    const obj = {
      a: 1,
      b: 2,
      c: { d: 3, e: 99 },
    }
    expect(deepFilter(obj, fn)).to.eql({ a: 1, b: 2, c: { d: 3 } })
  })

  it("should filter values in lists", () => {
    const obj = {
      a: 1,
      b: 2,
      c: [3, 99],
    }
    expect(deepFilter(obj, fn)).to.eql({ a: 1, b: 2, c: [3] })
  })

  it("should filter keys in objects in lists", () => {
    const obj = {
      a: 1,
      b: 2,
      c: [{ d: 3, e: 99 }],
    }
    expect(deepFilter(obj, fn)).to.eql({ a: 1, b: 2, c: [{ d: 3 }] })
  })
})

describe("deepOmitUndefined", () => {
  it("should omit keys with undefined values in a simple object", () => {
    const obj = {
      a: 1,
      b: 2,
      c: undefined,
    }
    expect(deepOmitUndefined(obj)).to.eql({ a: 1, b: 2 })
  })

  it("should omit keys with undefined values in a nested object", () => {
    const obj = {
      a: 1,
      b: 2,
      c: { d: 3, e: undefined },
    }
    expect(deepOmitUndefined(obj)).to.eql({ a: 1, b: 2, c: { d: 3 } })
  })

  it("should omit undefined values in lists", () => {
    const obj = {
      a: 1,
      b: 2,
      c: [3, undefined],
    }
    expect(deepOmitUndefined(obj)).to.eql({ a: 1, b: 2, c: [3] })
  })

  it("should omit undefined values in objects in lists", () => {
    const obj = {
      a: 1,
      b: 2,
      c: [{ d: 3, e: undefined }],
    }
    expect(deepOmitUndefined(obj)).to.eql({ a: 1, b: 2, c: [{ d: 3 }] })
  })
})
