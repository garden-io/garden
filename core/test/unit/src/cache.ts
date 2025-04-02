/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ContextNode } from "../../../src/cache.js"
import { BoundedCache, TreeCache } from "../../../src/cache.js"
import { expect } from "chai"
import { expectError } from "../../helpers.js"
import { getRootLogger } from "../../../src/logger/logger.js"

describe("TreeCache", () => {
  let cache: TreeCache
  const log = getRootLogger().createLog()

  beforeEach(() => {
    cache = new TreeCache()
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapToPairs = (m: Map<any, any>) => Array.from(m.entries())

  it("should store and retrieve a one-part key", () => {
    const key = ["my-key"]
    const value = "my-value"
    const context = ["some", "context"]

    cache.set(log, key, value, context)

    expect(cache.get(log, key)).to.equal(value)
  })

  it("should store and retrieve a multi-part key", () => {
    const key = ["multi", "part", "key"]
    const value = "my-value"
    const context = ["some", "context"]

    cache.set(log, key, value, context)

    expect(cache.get(log, key)).to.equal(value)
  })

  it("ContextNode should have consistent node states and hierarchical context keys", () => {
    const key = ["my-key"]
    const value = "my-value"
    const parentContext = ["context"]
    const contextA = [...parentContext, "a"]
    const contextB = [...parentContext, "b"]

    cache.set(log, key, value, contextA, contextB)

    const contextTreeRoot = cache["contextTree"] as ContextNode
    expect(contextTreeRoot.key).to.be.empty
    // non-leaf nodes contain only children
    expect(contextTreeRoot.children).to.be.not.empty
    // non-leaf nodes do not contain any entries
    expect(contextTreeRoot.entries).to.be.empty

    const parentContextNode = contextTreeRoot.children["context"]
    expect(parentContextNode.key).to.eql(parentContext)
    // non-leaf nodes contain only children
    expect(parentContextNode.children).to.be.not.empty
    // non-leaf nodes do not contain any entries
    expect(parentContextNode.entries).to.be.empty

    const expectedEntries = new Set([JSON.stringify(key)])

    const contextNodeA = parentContextNode.children["a"]
    expect(contextNodeA.key).to.eql(contextA)
    // leaf nodes do not contain any children
    expect(contextNodeA.children).to.be.empty
    // leaf nodes contain only entries
    expect(contextNodeA.entries).to.eql(expectedEntries)

    const contextNodeB = parentContextNode.children["b"]
    expect(contextNodeB.key).to.eql(contextB)
    // leaf nodes do not contain any children
    expect(contextNodeB.children).to.be.empty
    // leaf nodes contain only entries
    expect(contextNodeB.entries).to.eql(expectedEntries)
  })

  describe("getByContext", () => {
    it("should NOT return anything for incomplete (partial) context", () => {
      const key = ["my-key"]
      const value = "my-value"
      const parentContext = ["context"]
      const contextA = [...parentContext, "a"]
      const contextB = [...parentContext, "b"]

      cache.set(log, key, value, contextA, contextB)

      // parent context references a "non-leaf" node that never contains any entries
      expect(mapToPairs(cache.getByContext(parentContext))).to.eql([])
    })
  })

  describe("set", () => {
    it("should accept multiple contexts", () => {
      const key = ["my-key"]
      const value = "my-value"
      const contextA = ["context", "a"]
      const contextB = ["context", "b"]

      cache.set(log, key, value, contextA, contextB)

      expect(cache.get(log, key)).to.equal(value)
      expect(mapToPairs(cache.getByContext(contextA))).to.eql([[key, value]])
      expect(mapToPairs(cache.getByContext(contextB))).to.eql([[key, value]])
    })

    it("should merge contexts when setting key multiple times", () => {
      const key = ["my-key"]
      const value = "my-value"
      const contextA = ["context", "a"]
      const contextB = ["context", "b"]

      cache.set(log, key, value, contextA)
      cache.set(log, key, value, contextB)

      expect(cache.get(log, key)).to.equal(value)
      expect(mapToPairs(cache.getByContext(contextA))).to.eql([[key, value]])
      expect(mapToPairs(cache.getByContext(contextB))).to.eql([[key, value]])
    })

    it("should update value when setting key multiple times", () => {
      const key = ["my-key"]
      const value = "my-value"
      const valueB = "my-new-value"
      const context = ["context", "a"]

      cache.set(log, key, value, context)
      cache.set(log, key, valueB, context)

      expect(cache.get(log, key)).to.equal(valueB)
    })

    it("should throw with an empty key", async () => {
      const key = []
      const value = "my-value"
      const context = ["some", "context"]

      await expectError(() => cache.set(log, key, value, context), "parameter")
    })

    it("should throw with no context", async () => {
      const key = ["my-key"]
      const value = "my-value"

      await expectError(() => cache.set(log, key, value), "parameter")
    })

    it("should throw with an empty context", async () => {
      const key = ["my-key"]
      const value = "my-value"
      const context = []

      await expectError(() => cache.set(log, key, value, context), "parameter")
    })
  })

  describe("get", () => {
    it("should return undefined when key does not exist", () => {
      expect(cache.get(log, ["bla"])).to.be.undefined
    })
  })

  describe("getOrThrow", () => {
    it("should throw when key does not exist", async () => {
      await expectError(() => cache.getOrThrow(log, ["bla"]), "not-found")
    })
  })

  describe("delete", () => {
    it("should delete a specific entry from the cache", () => {
      const key = ["my-key"]
      const value = "my-value"
      const context = ["context", "a"]

      cache.set(log, key, value, context)
      cache.delete(log, key)

      expect(cache.get(log, key)).to.be.undefined
      expect(cache.getByContext(context).size).to.equal(0)
    })
  })

  describe("invalidate", () => {
    it("should invalidate keys with the exact given context", () => {
      const keyA = ["key", "a"]
      const valueA = "value-a"
      const contextA = ["context", "a"]

      cache.set(log, keyA, valueA, contextA)

      const keyB = ["key", "b"]
      const valueB = "value-b"
      const contextB = ["context", "b"]

      cache.set(log, keyB, valueB, contextB)

      cache.invalidate(log, contextA)

      expect(cache.get(log, keyA)).to.be.undefined
      expect(cache.get(log, keyB)).to.equal(valueB)
    })

    it("should remove entry from all associated contexts", () => {
      const key = ["my", "key"]
      const value = "my-value"
      const contextA = ["some", "context"]
      const contextB = ["other", "context"]

      cache.set(log, key, value, contextA, contextB)
      cache.invalidate(log, contextB)

      expect(cache.get(log, key)).to.be.undefined
      expect(mapToPairs(cache.getByContext(contextA))).to.eql([])
      expect(mapToPairs(cache.getByContext(contextB))).to.eql([])
    })

    it("should return if the specified context cannot be found", () => {
      cache.invalidate(log, ["bla"])
    })
  })

  describe("invalidateUp", () => {
    it("should invalidate keys with the specified context and above in the tree", () => {
      const keyA = ["key", "a"]
      const valueA = "value-a"
      const contextA = ["section-a", "a"]

      cache.set(log, keyA, valueA, contextA)

      const keyB = ["key", "b"]
      const valueB = "value-b"
      const contextB = ["section-a", "a", "nested"]

      cache.set(log, keyB, valueB, contextB)

      const keyC = ["key", "c"]
      const valueC = "value-c"
      const contextC = ["section-b", "c"]

      cache.set(log, keyC, valueC, contextC)

      cache.invalidateUp(log, contextB)

      expect(cache.get(log, keyA)).to.be.undefined
      expect(cache.get(log, keyB)).to.be.undefined
      expect(cache.get(log, keyC)).to.equal(valueC)
    })

    it("should return if the specified context cannot be found", () => {
      cache.invalidateUp(log, ["bla"])
    })
  })

  describe("invalidateDown", () => {
    it("should invalidate keys with the specified context and below in the tree", () => {
      const keyA = ["key", "a"]
      const valueA = "value-a"
      const contextA = ["section-a", "a"]

      cache.set(log, keyA, valueA, contextA)

      const keyB = ["key", "b"]
      const valueB = "value-b"
      const contextB = ["section-a", "a", "nested"]

      cache.set(log, keyB, valueB, contextB)

      const keyC = ["key", "c"]
      const valueC = "value-c"
      const contextC = ["section-b", "c"]

      cache.set(log, keyC, valueC, contextC)

      cache.invalidateDown(log, ["section-a"])

      expect(cache.get(log, keyA)).to.be.undefined
      expect(cache.get(log, keyB)).to.be.undefined
      expect(cache.get(log, keyC)).to.equal(valueC)
    })

    it("should return if the specified context cannot be found", () => {
      cache.invalidateDown(log, ["bla"])
    })
  })
})

describe("BoundedCache", () => {
  it("should set and retrieve a value under a given key", () => {
    const cache = new BoundedCache<string>(100)
    cache.set("a", "foo")
    expect(cache.get("a")).to.eql("foo")
    expect(cache.get("b")).to.eql(null)
  })

  it("should prune older keys when the maximum number of keys is exceeded", () => {
    const maxCount = 10
    const cache = new BoundedCache<string>(maxCount)
    for (let i = 0; i < maxCount + 1; i++) {
      cache.set(`${i}`, `val#${i}`)
    }
    // We expect the first 5 keys to have been removed.
    expect(cache["keys"]).to.eql(["5", "6", "7", "8", "9", "10"])
    expect(cache["cache"]).to.eql({
      5: "val#5",
      6: "val#6",
      7: "val#7",
      8: "val#8",
      9: "val#9",
      10: "val#10",
    })
  })
})
