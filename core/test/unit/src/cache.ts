/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { TreeCache } from "../../../src/cache"
import { expect } from "chai"
import { expectError } from "../../helpers"

describe("TreeCache", () => {
  let cache: TreeCache

  beforeEach(() => {
    cache = new TreeCache()
  })

  const mapToPairs = (m: Map<any, any>) => Array.from(m.entries())

  it("should store and retrieve a one-part key", () => {
    const key = ["my-key"]
    const value = "my-value"
    const context = ["some", "context"]

    cache.set(key, value, context)

    expect(cache.get(key)).to.equal(value)
  })

  it("should store and retrieve a multi-part key", () => {
    const key = ["multi", "part", "key"]
    const value = "my-value"
    const context = ["some", "context"]

    cache.set(key, value, context)

    expect(cache.get(key)).to.equal(value)
  })

  describe("set", () => {
    it("should accept multiple contexts", () => {
      const key = ["my-key"]
      const value = "my-value"
      const contextA = ["context", "a"]
      const contextB = ["context", "b"]

      cache.set(key, value, contextA, contextB)

      expect(cache.get(key)).to.equal(value)
      expect(mapToPairs(cache.getByContext(contextA))).to.eql([[key, value]])
      expect(mapToPairs(cache.getByContext(contextB))).to.eql([[key, value]])
    })

    it("should merge contexts when setting key multiple times", () => {
      const key = ["my-key"]
      const value = "my-value"
      const contextA = ["context", "a"]
      const contextB = ["context", "b"]

      cache.set(key, value, contextA)
      cache.set(key, value, contextB)

      expect(cache.get(key)).to.equal(value)
      expect(mapToPairs(cache.getByContext(contextA))).to.eql([[key, value]])
      expect(mapToPairs(cache.getByContext(contextB))).to.eql([[key, value]])
    })

    it("should update value when setting key multiple times", () => {
      const key = ["my-key"]
      const value = "my-value"
      const valueB = "my-new-value"
      const context = ["context", "a"]

      cache.set(key, value, context)
      cache.set(key, valueB, context)

      expect(cache.get(key)).to.equal(valueB)
    })

    it("should throw with an empty key", async () => {
      const key = []
      const value = "my-value"
      const context = ["some", "context"]

      await expectError(() => cache.set(key, value, context), "parameter")
    })

    it("should throw with no context", async () => {
      const key = ["my-key"]
      const value = "my-value"

      await expectError(() => cache.set(key, value), "parameter")
    })

    it("should throw with an empty context", async () => {
      const key = ["my-key"]
      const value = "my-value"
      const context = []

      await expectError(() => cache.set(key, value, context), "parameter")
    })
  })

  describe("get", () => {
    it("should return undefined when key does not exist", () => {
      expect(cache.get(["bla"])).to.be.undefined
    })
  })

  describe("getOrThrow", () => {
    it("should throw when key does not exist", async () => {
      await expectError(() => cache.getOrThrow(["bla"]), "not-found")
    })
  })

  describe("delete", () => {
    it("should delete a specific entry from the cache", () => {
      const key = ["my-key"]
      const value = "my-value"
      const context = ["context", "a"]

      cache.set(key, value, context)
      cache.delete(key)

      expect(cache.get(key)).to.be.undefined
      expect(cache.getByContext(context).size).to.equal(0)
    })
  })

  describe("invalidate", () => {
    it("should invalidate keys with the exact given context", () => {
      const keyA = ["key", "a"]
      const valueA = "value-a"
      const contextA = ["context", "a"]

      cache.set(keyA, valueA, contextA)

      const keyB = ["key", "b"]
      const valueB = "value-b"
      const contextB = ["context", "b"]

      cache.set(keyB, valueB, contextB)

      cache.invalidate(contextA)

      expect(cache.get(keyA)).to.be.undefined
      expect(cache.get(keyB)).to.equal(valueB)
    })

    it("should remove entry from all associated contexts", () => {
      const key = ["my", "key"]
      const value = "my-value"
      const contextA = ["some", "context"]
      const contextB = ["other", "context"]

      cache.set(key, value, contextA, contextB)
      cache.invalidate(contextB)

      expect(cache.get(key)).to.be.undefined
      expect(mapToPairs(cache.getByContext(contextA))).to.eql([])
      expect(mapToPairs(cache.getByContext(contextB))).to.eql([])
    })

    it("should return if the specified context cannot be found", () => {
      cache.invalidate(["bla"])
    })
  })

  describe("invalidateUp", () => {
    it("should invalidate keys with the specified context and above in the tree", () => {
      const keyA = ["key", "a"]
      const valueA = "value-a"
      const contextA = ["section-a", "a"]

      cache.set(keyA, valueA, contextA)

      const keyB = ["key", "b"]
      const valueB = "value-b"
      const contextB = ["section-a", "a", "nested"]

      cache.set(keyB, valueB, contextB)

      const keyC = ["key", "c"]
      const valueC = "value-c"
      const contextC = ["section-b", "c"]

      cache.set(keyC, valueC, contextC)

      cache.invalidateUp(contextB)

      expect(cache.get(keyA)).to.be.undefined
      expect(cache.get(keyB)).to.be.undefined
      expect(cache.get(keyC)).to.equal(valueC)
    })

    it("should return if the specified context cannot be found", () => {
      cache.invalidateUp(["bla"])
    })
  })

  describe("invalidateDown", () => {
    it("should invalidate keys with the specified context and below in the tree", () => {
      const keyA = ["key", "a"]
      const valueA = "value-a"
      const contextA = ["section-a", "a"]

      cache.set(keyA, valueA, contextA)

      const keyB = ["key", "b"]
      const valueB = "value-b"
      const contextB = ["section-a", "a", "nested"]

      cache.set(keyB, valueB, contextB)

      const keyC = ["key", "c"]
      const valueC = "value-c"
      const contextC = ["section-b", "c"]

      cache.set(keyC, valueC, contextC)

      cache.invalidateDown(["section-a"])

      expect(cache.get(keyA)).to.be.undefined
      expect(cache.get(keyB)).to.be.undefined
      expect(cache.get(keyC)).to.equal(valueC)
    })

    it("should return if the specified context cannot be found", () => {
      cache.invalidateDown(["bla"])
    })
  })
})
