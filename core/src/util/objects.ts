/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { isArray, isPlainObject, mapValues, pickBy } from "lodash-es"

/**
 * Recursively process all values in the given input,
 * walking through all object keys _and array items_.
 */
export function deepMap<T extends object, U extends object = T>(
  value: T | Iterable<T>,
  fn: (value: any, key: string | number) => any,
  key?: number | string
): U | Iterable<U> {
  if (isArray(value)) {
    return value.map((v, k) => <U>deepMap(v, fn, k))
  } else if (isPlainObject(value)) {
    return <U>mapValues(value, (v, k) => deepMap(<T>(<unknown>v), fn, k))
  } else {
    return <U>fn(value, key || 0)
  }
}

/**
 * Recursively filter all keys and values in the given input,
 * walking through all object keys _and array items_.
 */
export function deepFilter<T extends object, U extends object = T>(
  value: T | Iterable<T>,
  fn: (value: any, key: string | number) => boolean
): U | Iterable<U> {
  if (isArray(value)) {
    return <Iterable<U>>value.filter(fn).map((v) => deepFilter(v, fn))
  } else if (isPlainObject(value)) {
    return <U>mapValues(pickBy(<U>value, fn), (v) => deepFilter(v, fn))
  } else {
    return <U>value
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
