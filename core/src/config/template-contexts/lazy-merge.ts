/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { DeepPrimitiveMap } from "../common.js"
import { InternalError } from "../../exceptions.js"
import { isArray, isPlainObject, max, uniq } from "lodash-es"

/**
 * Creates a proxy object that emulates recursive merge of the given variables.
 *
 * It takes the given variable scopes and does lookup operations in the order of the scope appearance,
 * instead of merging the given variable scopes physically.
 *
 * The last scope in the input variable scopes takes the highest precedence.
 *
 * @param items input
 */
export function lazyMerge(...items: DeepPrimitiveMap[]): DeepPrimitiveMap {
  let computedOwnKeys: string[] | undefined

  function computeOwnKeys() {
    if (!computedOwnKeys) {
      const ownKeys = new Set()

      for (const i of items) {
        for (const k in i) {
          ownKeys.add(k)
        }
      }

      if (isArrayProxy) {
        ownKeys.add("length")
      }

      computedOwnKeys = Array.from(ownKeys) as string[]
    }

    return computedOwnKeys
  }

  let totalLength: number | undefined

  function computeTotalLength(): number {
    if (!totalLength) {
      totalLength = max(items.map((i) => i.length as number))
    }

    return totalLength!
  }

  function* arrayIterator() {
    const l = computeTotalLength()
    for (let i = 0; i < l; i++) {
      yield proxy[i]
    }
  }

  const isArrayProxy = items.every((i) => isArray(i))

  const proxy = new Proxy(isArrayProxy ? [] : {}, {
    get: (target, key: string | symbol) => {
      if (isArrayProxy && key === Symbol.iterator) {
        return arrayIterator
      }

      if (typeof key === "symbol") {
        return undefined
      }

      if (isArrayProxy && key === "length") {
        return computeTotalLength()
      } else if (isArrayProxy && key in target) {
        throw new InternalError({
          message: "array methods are not supported with lazyMerge proxy objects.",
        })
      }

      const newItems: DeepPrimitiveMap[] = []
      for (const item of reversed(items)) {
        const el = item[key]
        if (isArray(el) || isPlainObject(el)) {
          newItems.unshift(el as DeepPrimitiveMap)
        } else if (el !== undefined) {
          return el
        }
      }

      if (newItems.length === 0) {
        return undefined
      }

      return lazyMerge(...newItems)
    },

    set: () => {
      throw new InternalError({ message: "Proxy objects returned by lazyMerge are immutable" })
    },

    has(_target, key) {
      if (typeof key === "symbol") {
        return false
      }

      return computeOwnKeys().includes(key)
    },

    ownKeys() {
      return computeOwnKeys()
    },

    getOwnPropertyDescriptor(target, key) {
      if (isArrayProxy && (key === "length" || key === Symbol.iterator)) {
        return Object.getOwnPropertyDescriptor(target, key)
      }

      if (typeof key === "symbol") {
        return undefined
      }

      if (!computeOwnKeys().includes(key)) {
        return undefined
      }

      return { enumerable: true, writable: false, configurable: true }
    },
  })
  return proxy
}

function* reversed<T extends unknown[]>(arr: T): Generator<T[number]> {
  for (let i = arr.length - 1; i >= 0; i--) {
    yield arr[i]
  }
}
