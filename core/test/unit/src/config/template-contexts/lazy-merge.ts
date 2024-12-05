/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import merge from "lodash-es/merge.js"
import { lazyMerge } from "../../../../../src/config/template-contexts/lazy-merge.js"
import { cloneDeep, isArray, isObject } from "lodash-es"

describe("lazyMerge", () => {
  it("merges objects recursively just like lodash merge, but lazily", () => {
    const a = { hello: "world" }
    const b = { fruit: "banana" }
    const merged = lazyMerge(a, b)
    expect(merged).to.deep.equal({
      hello: "world",
      fruit: "banana",
    })
    const lodashMerged = merge(cloneDeep(a), b)
    expect(merged, "output was different compared to lodash merge").to.deep.equal(lodashMerged)
  })
  it("merges objects and arrays recursively, just like lodash merge", () => {
    const a = { a: { hello: "world" }, b: [1, 2, 3, "a", "b", "c"] }
    const b = { a: { fruit: "banana" }, b: [4, 5, 6] }
    const merged = lazyMerge(a, b)
    expect(merged).to.deep.equal({
      a: {
        hello: "world",
        fruit: "banana",
      },
      b: [4, 5, 6, "a", "b", "c"], // lodash merge will treat arrays just like objects
    })
    const lodashMerged = merge(cloneDeep(a), b)
    expect(merged, "output was different compared to lodash merge").to.deep.equal(lodashMerged)
  })
  it("has the same precedence as lodash merge. The last argument takes precedence", () => {
    const a = { fruit: "apple" }
    const b = { fruit: "banana" }
    const merged = lazyMerge(a, b)
    expect(merged).to.deep.equal({
      fruit: "banana",
    })
    const lodashMerged = merge(cloneDeep(a), b)
    expect(merged, "output was different compared to lodash merge").to.deep.equal(lodashMerged)
  })
  it("still passes object or array tests", () => {
    const merged = lazyMerge({ a: [1, 2, 3], b: { foo: "bar" } }, { a: [1, 2, 3, 4, 5, 6] })

    expect(isArray(merged.a)).to.be.true
    expect(isObject(merged.b)).to.be.true
  })
  it("it chooses primitive value of higher precedence when encountering deep collision (array)", () => {
    const a = { a: [1, 2, 3] }
    const b = { a: "hello" }
    const merged = lazyMerge(a, b)
    expect(merged).to.deep.equal({
      a: "hello",
    })
    const lodashMerged = merge(cloneDeep(a), b)
    expect(merged, "output was different compared to lodash merge").to.deep.equal(lodashMerged)
  })
  it("it chooses primitive value of higher precedence when encountering deep collision (object)", () => {
    const a = { a: { foo: "bar" } }
    const b = { a: "hello" }
    const merged = lazyMerge(a, b)
    expect(merged).to.deep.equal({
      a: "hello",
    })
    const lodashMerged = merge(cloneDeep(a), b)
    expect(merged, "output was different compared to lodash merge").to.deep.equal(lodashMerged)
  })
})
