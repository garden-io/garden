/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/**
 * Copied from the sindresorhus/p-memoize npm package, v6.0.1.
 * Had to do that because it's distributed as an ES module, which we can't support right now.
 */

import mimicFn from "mimic-function"
import type { AsyncReturnType } from "type-fest"

// TODO: Use the one in `type-fest` when it's added there.
type AnyAsyncFunction = (...args: readonly any[]) => Promise<unknown | void>

function getNewStores() {
  return {
    cacheStore: new WeakMap<AnyAsyncFunction, CacheStorage<any, any>>(),
    promiseCacheStore: new WeakMap<AnyAsyncFunction, Map<unknown, unknown>>(),
  }
}

let { cacheStore, promiseCacheStore } = getNewStores()

interface CacheStorage<KeyType, ValueType> {
  has: (key: KeyType) => Promise<boolean> | boolean
  get: (key: KeyType) => Promise<ValueType | undefined> | ValueType | undefined
  set: (key: KeyType, value: ValueType) => void
  delete: (key: KeyType) => void
  clear?: () => void
}

interface Options<FunctionToMemoize extends AnyAsyncFunction, CacheKeyType> {
  readonly cachePromiseRejection?: boolean
  readonly cacheKey?: (args: Parameters<FunctionToMemoize>) => CacheKeyType
  readonly cache?: CacheStorage<CacheKeyType, AsyncReturnType<FunctionToMemoize>>
}

export default function pMemoize<FunctionToMemoize extends AnyAsyncFunction, CacheKeyType>(
  fn: FunctionToMemoize,
  {
    cachePromiseRejection = false,
    cacheKey,
    cache = new Map<CacheKeyType, AsyncReturnType<FunctionToMemoize>>(),
  }: Options<FunctionToMemoize, CacheKeyType> = {}
): FunctionToMemoize {
  const promiseCache = new Map<CacheKeyType, Promise<AsyncReturnType<FunctionToMemoize>>>()

  const memoized = async function (
    this: any,
    ...args: Parameters<FunctionToMemoize>
  ): Promise<AsyncReturnType<FunctionToMemoize>> {
    const key = cacheKey ? cacheKey(args) : (args[0] as CacheKeyType)

    if (await cache.has(key)) {
      if (promiseCache.has(key)) {
        return promiseCache.get(key)!
      }

      return (await cache.get(key))!
    }

    const promise = fn.apply(this, args) as Promise<AsyncReturnType<FunctionToMemoize>>

    promiseCache.set(key, promise)

    try {
      const result = await promise

      cache.set(key, result)

      return result
    } catch (error) {
      if (!cachePromiseRejection) {
        promiseCache.delete(key)
      }

      throw error as Error
    }
  } as FunctionToMemoize

  mimicFn(memoized, fn, {
    ignoreNonConfigurable: true,
  })

  cacheStore.set(memoized, cache)
  promiseCacheStore.set(memoized, promiseCache)

  return memoized
}

export function pMemoizeDecorator<FunctionToMemoize extends AnyAsyncFunction, CacheKeyType>(
  options: Options<FunctionToMemoize, CacheKeyType> = {}
) {
  const instanceMap = new WeakMap()

  return (target: any, propertyKey: string, descriptor: PropertyDescriptor): void => {
    // eslint-disable-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const input = target[propertyKey]

    if (typeof input !== "function") {
      throw new TypeError("The decorated value must be a function")
    }

    delete descriptor.value
    delete descriptor.writable

    descriptor.get = function () {
      // eslint-disable: no-invalid-this
      if (!instanceMap.has(this)) {
        const value = pMemoize(input, options) as FunctionToMemoize
        instanceMap.set(this, value)
        return value
      }

      return instanceMap.get(this) as FunctionToMemoize
    }
  }
}

export function pMemoizeClear(fn: AnyAsyncFunction): void {
  const cache = cacheStore.get(fn)
  if (!cache) {
    throw new TypeError("Can't clear a function that was not memoized!")
  }

  if (typeof cache.clear !== "function") {
    throw new TypeError("The cache Map can't be cleared!")
  }

  cache.clear()
  promiseCacheStore.get(fn)!.clear()
}

export function pMemoizeClearAll() {
  const newStores = getNewStores()
  cacheStore = newStores.cacheStore
  promiseCacheStore = newStores.promiseCacheStore
}
