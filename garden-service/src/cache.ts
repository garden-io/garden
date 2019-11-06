/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { isEqual } from "lodash"
import { normalize, parse, sep } from "path"
import { InternalError, NotFoundError, ParameterError } from "./exceptions"

export type CacheKey = string[]
export type CacheContext = string[]
export type CurriedKey = string

export type CacheValue = string | number | boolean | null | object
export type CacheValues = Map<CacheKey, CacheValue>

interface CacheEntry {
  key: CacheKey
  value: CacheValue
  contexts: { [curriedContext: string]: CacheContext }
}

type CacheEntries = Map<CurriedKey, CacheEntry>

interface ContextNode {
  key: CacheContext
  children: { [contextPart: string]: ContextNode }
  entries: Set<CurriedKey>
}

/**
 *  A simple in-memory cache that additionally indexes keys in a tree by a seperate context key, so that keys
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
  private readonly cache: CacheEntries
  private readonly contextTree: ContextNode

  constructor() {
    this.cache = new Map<CurriedKey, CacheEntry>()
    this.contextTree = makeContextNode([])
  }

  set(key: CacheKey, value: CacheValue, ...contexts: CacheContext[]) {
    if (key.length === 0) {
      throw new ParameterError(`Cache key must have at least one part`, {
        key,
        contexts,
      })
    }

    if (contexts.length === 0) {
      throw new ParameterError(`Must specify at least one context`, {
        key,
        contexts,
      })
    }

    const curriedKey = curry(key)
    let entry = this.cache.get(curriedKey)

    if (entry === undefined) {
      entry = { key, value, contexts: {} }
      this.cache.set(curriedKey, entry)
    } else {
      // merge with the existing entry
      entry.value = value
    }

    contexts.forEach((c) => (entry!.contexts[curry(c)] = c))

    for (const context of Object.values(contexts)) {
      let node = this.contextTree

      if (context.length === 0) {
        throw new ParameterError(`Context key must have at least one part`, {
          key,
          context,
        })
      }

      const contextKey: CacheContext = []

      for (const part of context) {
        contextKey.push(part)

        if (node.children[part]) {
          node = node.children[part]
        } else {
          node = node.children[part] = makeContextNode(contextKey)
        }
      }

      node.entries.add(curriedKey)
    }
  }

  get(key: CacheKey): CacheValue | undefined {
    const entry = this.cache.get(curry(key))
    return entry ? entry.value : undefined
  }

  getOrThrow(key: CacheKey): CacheValue {
    const value = this.get(key)
    if (value === undefined) {
      throw new NotFoundError(`Could not find key ${key} in cache`, { key })
    }
    return value
  }

  getByContext(context: CacheContext): CacheValues {
    let pairs: [CacheKey, CacheValue][] = []

    const node = this.getNode(context)

    if (node) {
      pairs = Array.from(node.entries).map((curriedKey) => {
        const entry = this.cache.get(curriedKey)
        if (!entry) {
          throw new InternalError(`Invalid reference found in cache: ${curriedKey}`, { curriedKey })
        }
        return <[CacheKey, CacheValue]>[entry.key, entry.value]
      })
    }

    return new Map<CacheKey, CacheValue>(pairs)
  }

  /**
   * Delete a specific entry from the cache.
   */
  delete(key: CacheKey) {
    const curriedKey = curry(key)
    const entry = this.cache.get(curriedKey)

    if (entry === undefined) {
      return
    }

    this.cache.delete(curriedKey)

    // clear the entry from its contexts
    for (const context of Object.values(entry.contexts)) {
      const node = this.getNode(context)
      node && node.entries.delete(curriedKey)
    }
  }

  /**
   * Invalidates all cache entries whose context equals `context`
   */
  invalidate(context: CacheContext) {
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
  invalidateUp(context: CacheContext) {
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
  invalidateDown(context: CacheContext) {
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
    for (const curriedKey of node.entries) {
      const entry = this.cache.get(curriedKey)

      if (entry === undefined) {
        return
      }

      // also clear the invalidated entry from its other contexts
      for (const context of Object.values(entry.contexts)) {
        if (!isEqual(context, node.key)) {
          const otherNode = this.getNode(context)
          otherNode && otherNode.entries.delete(curriedKey)
        }
      }

      this.cache.delete(curriedKey)
    }

    node.entries = new Set<CurriedKey>()

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
    entries: new Set<CurriedKey>(),
  }
}

function curry(key: CacheKey | CacheContext) {
  return JSON.stringify(key)
}

export function pathToCacheContext(path: string): CacheContext {
  const parsed = parse(normalize(path))
  return ["path", ...parsed.dir.split(sep)]
}
