/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { isEqual } from "lodash-es"
import { normalize, parse, sep } from "path"
import { ParameterError, NotFoundError } from "./exceptions.js"
import type { Log } from "./logger/log-entry.js"

export type CacheKey = string[]
export type CacheContext = string[]

export type CacheValue = any
export type CacheValues = Map<CacheKey, CacheValue>

interface CacheEntry {
  key: CacheKey
  value: CacheValue
  contexts: { [stringContext: string]: CacheContext }
}

type CacheEntries = Map<string, CacheEntry>

/**
 * Represents a node (either a non-leaf or a leaf) node of the context tree.
 *
 *  - A non-leaf node can have only children and has no entries.
 *  - A leaf node has only entries and cannot have any children.
 */
export interface ContextNode {
  key: CacheContext
  children: { [contextPart: string]: ContextNode }
  entries: Set<string>
}

/**
 *  A simple in-memory cache that additionally indexes keys in a tree by a separate context key, so that keys
 *  can be invalidated based on surrounding context.
 *
 *  For example, we can cache the version of a directory path, and then invalidate every cached key under a
 *  parent path:
 *
 *  ```
 *  const cache = new TreeCache()
 *
 *  # The context parameter (last parameter) here is the path to the module source
 *  cache.set(["modules", "my-module-a"], module, ["modules", "module-path-a"])
 *  cache.set(["modules", "my-module-b"], module, ["modules", "module-path-b"])
 *
 *  # Invalidates the cache for module-a
 *  cache.invalidate(["modules", "module-path-a"])
 *
 *  # Also invalidates the cache for module-a
 *  cache.invalidateUp(["modules", "module-path-a", "subdirectory"])
 *
 *  # Invalidates the cache for both modules
 *  cache.invalidateDown(["modules"])
 *  ```
 *
 *  This is useful, for example, when listening for filesystem events to make sure cached items stay in
 *  sync after making changes to sources.
 *
 *  A single cache entry can also have multiple invalidation contexts, which is helpful when a cache key
 *  can be invalidated by changes to multiple contexts (say for a module version, which should also be
 *  invalidated when dependencies are updated).
 *
 */
export class TreeCache {
  private cache: CacheEntries = new Map<string, CacheEntry>()
  private contextTree: ContextNode = makeContextNode([])

  constructor() {
    this.clear()
  }

  clear() {
    this.cache = new Map<string, CacheEntry>()
    this.contextTree = makeContextNode([])
  }

  set(log: Log, key: CacheKey, value: CacheValue, ...contexts: CacheContext[]) {
    if (key.length === 0) {
      throw new ParameterError({
        message: `Cache key must have at least one part. Actually got empty list. Contexts: ${contexts.join(", ")}`,
      })
    }

    if (contexts.length === 0) {
      throw new ParameterError({
        message: `Could not set key '${key.join(".")}': Must specify at least one context. Got empty list.`,
      })
    }

    const stringKey = stringifyKey(key)

    log.silly(() => `TreeCache: Setting value for key ${stringKey}`)

    let entry = this.cache.get(stringKey)

    if (entry === undefined) {
      entry = { key, value, contexts: {} }
      this.cache.set(stringKey, entry)
    } else {
      // merge with the existing entry
      entry.value = value
    }

    contexts.forEach((c) => (entry.contexts[stringifyKey(c)] = c))

    for (const context of Object.values(contexts)) {
      let node = this.contextTree

      if (context.length === 0) {
        throw new ParameterError({
          message: `Could not set key '${key.join(
            "."
          )}': All context keys must have at least one part. At least one of them is an empty list.`,
        })
      }

      const contextKey: CacheContext = []

      for (const part of context) {
        contextKey.push(part)

        let child = node.children[part]
        if (child) {
          node = child
        } else {
          child = makeContextNode([...contextKey])
          node.children[part] = child
          node = child
        }
      }

      node.entries.add(stringKey)
    }
  }

  get(log: Log, key: CacheKey): CacheValue | undefined {
    const stringKey = stringifyKey(key)
    const entry = this.cache.get(stringKey)

    if (entry) {
      log.silly(() => `TreeCache: Found cached value for key ${stringKey}`)
      return entry.value
    }

    return undefined
  }

  getOrThrow(log: Log, key: CacheKey): CacheValue {
    const value = this.get(log, key)
    if (value === undefined) {
      throw new NotFoundError({ message: `Could not find key ${key} in cache` })
    }
    return value
  }

  getByContext(context: CacheContext): CacheValues {
    let pairs: [CacheKey, CacheValue][] = []

    const node = this.getNode(context)

    if (node) {
      pairs = Array.from(node.entries).map((stringKey) => {
        const entry = this.cache.get(stringKey)
        if (!entry) {
          throw new ParameterError({
            message: `Invalid reference found in cache: ${stringKey}`,
          })
        }
        return <[CacheKey, CacheValue]>[entry.key, entry.value]
      })
    }

    return new Map<CacheKey, CacheValue>(pairs)
  }

  /**
   * Delete a specific entry from the cache.
   */
  delete(log: Log, key: CacheKey) {
    log.silly(() => `TreeCache: Deleting key ${stringifyKey(key)}`)

    const stringKey = stringifyKey(key)
    const entry = this.cache.get(stringKey)

    if (entry === undefined) {
      return
    }

    this.cache.delete(stringKey)

    // clear the entry from its contexts
    for (const context of Object.values(entry.contexts)) {
      const node = this.getNode(context)
      node && node.entries.delete(stringKey)
    }
  }

  /**
   * Invalidates all cache entries whose context equals `context`
   */
  invalidate(log: Log, context: CacheContext) {
    log.silly(() => `TreeCache: Invalidating all caches for context ${stringifyKey(context)}`)

    const node = this.getNode(context)

    if (node) {
      // clear all cache entries on the node
      this.clearNode(node, false)
    }
  }

  /**
   * Invalidates all cache entries where the given `context` starts with the entries' context
   * (i.e. the whole path from the tree root down to the context leaf)
   */
  invalidateUp(log: Log, context: CacheContext) {
    log.silly(() => `TreeCache: Invalidating caches up from context ${stringifyKey(context)}`)

    let node = this.contextTree

    for (const part of context) {
      node = node.children[part]
      if (!node) {
        break
      }
      this.clearNode(node, false)
    }
  }

  /**
   * Invalidates all cache entries whose context _starts_ with the given `context`
   * (i.e. the context node and the whole tree below it)
   */
  invalidateDown(log: Log, context: CacheContext) {
    log.silly(() => `TreeCache: Invalidating caches down from context ${stringifyKey(context)}`)

    const node = this.getNode(context)

    if (node) {
      // clear all cache entries in the node and recursively through all child nodes
      this.clearNode(node, true)
    }
  }

  private getNode(context: CacheContext) {
    let node = this.contextTree

    for (const part of context) {
      node = node.children[part]

      if (!node) {
        // no cache keys under the given context
        return
      }
    }

    return node
  }

  private clearNode(node: ContextNode, clearChildNodes: boolean) {
    for (const stringKey of node.entries) {
      const entry = this.cache.get(stringKey)

      if (entry === undefined) {
        return
      }

      // also clear the invalidated entry from its other contexts
      for (const context of Object.values(entry.contexts)) {
        if (!isEqual(context, node.key)) {
          const otherNode = this.getNode(context)
          otherNode && otherNode.entries.delete(stringKey)
        }
      }

      this.cache.delete(stringKey)
    }

    node.entries = new Set<string>()

    if (clearChildNodes) {
      for (const child of Object.values(node.children)) {
        this.clearNode(child, true)
      }
    }
  }
}

function makeContextNode(key: CacheContext): ContextNode {
  return {
    key,
    children: {},
    entries: new Set<string>(),
  }
}

function stringifyKey(key: CacheKey | CacheContext) {
  return JSON.stringify(key)
}

export function pathToCacheContext(path: string): CacheContext {
  const parsed = parse(normalize(path))
  return ["path", ...parsed.dir.split(sep)]
}

/**
 * A simple in-memory cache that prunes older entries once the maximum size (as measured by key count) has been
 * reached.
 *
 * Useful for scenarios where new keys accumulate indefinitely, and there's a need to prevent unbounded memory use.
 */
export class BoundedCache<CachedValue> {
  private cache: {
    [key: string]: CachedValue
  } = {}
  private keys: string[] = []

  constructor(private maxCacheCount = 1000) {}

  get(key: string): CachedValue | null {
    return this.cache[key] || null
  }

  set(key: string, val: CachedValue): void {
    if (this.keys.length >= this.maxCacheCount) {
      const pruneCount = Math.floor(this.maxCacheCount / 2)
      // We remove the oldest `pruneCount` ids and their associated values.
      const idsToPrune = this.keys.slice(0, pruneCount)
      for (const pruneId of idsToPrune) {
        delete this.cache[pruneId]
      }
      this.keys.splice(0, pruneCount)
    }
    if (!this.cache[key]) {
      this.keys.push(key)
    }
    this.cache[key] = val
  }

  /**
   * Returns true if a value existed and was deleted, returns false otherwise.
   */
  delete(key: string): boolean {
    const existed = !!this.cache[key]
    delete this.cache[key]
    return existed
  }
}
