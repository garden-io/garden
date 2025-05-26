/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { isPlainObject as lodashIsPlainObject, mapValues, pickBy } from "lodash-es"

export type Collection<P> = CollectionOrValue<P>[] | { [key: string]: CollectionOrValue<P> }

export type CollectionOrValue<P> = P | Collection<P>

// adds appropriate type guard to Array.isArray
export function isArray<P>(value: CollectionOrValue<P>): value is CollectionOrValue<P>[] {
  return Array.isArray(value)
}

// adds appropriate type guard to lodash isPlainObject
export function isPlainObject<P>(value: CollectionOrValue<P>): value is { [key: string]: CollectionOrValue<P> } {
  return lodashIsPlainObject(value)
}

/**
 * Recursively process all values in the given input,
 * walking through all object keys _and array items_.
 */
export function deepMap<V, R>(
  value: CollectionOrValue<V>,
  fn: (value: Exclude<V, Collection<V>>, key: string | number, keyPath: (number | string)[]) => R,
  keyPath: (number | string)[] = []
): CollectionOrValue<R> {
  if (isArray(value)) {
    return value.map((v, k) => deepMap(v, fn, [...keyPath, k]))
  } else if (isPlainObject(value)) {
    return mapValues(value, (v, k) => deepMap(v, fn, [...keyPath, k]))
  } else {
    return fn(value as Exclude<V, Collection<V>>, keyPath[keyPath.length - 1] || 0, keyPath)
  }
}

/**
 * Recursively filter all keys and values in the given input,
 * walking through all object keys _and array items_.
 */
export function deepFilter<V>(
  value: CollectionOrValue<V>,
  fn: (value: any, key: string | number) => boolean
): CollectionOrValue<V> {
  if (isArray(value)) {
    return value.filter(fn).map((v) => deepFilter(v, fn))
  } else if (isPlainObject(value)) {
    return mapValues(pickBy(value, fn), (v) => deepFilter(v, fn))
  } else {
    return value
  }
}

export function omitUndefined(o: object) {
  return pickBy(o, (v: any) => v !== undefined)
}

/**
 * Recursively go through an object or array and strip all keys with undefined values, as well as undefined
 * values from arrays. Note: Also iterates through arrays recursively.
 */
export function deepOmitUndefined(obj: object) {
  return deepFilter(obj, (v) => v !== undefined)
}

/**
 * Returns true if `obj` is a Promise, otherwise false.
 */
export function isPromise(obj: any): obj is Promise<any> {
  return !!obj && (typeof obj === "object" || typeof obj === "function") && typeof obj.then === "function"
}
