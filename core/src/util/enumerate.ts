/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/**
 * Analogue of the Python's {@code enumerate} function.
 * See https://docs.python.org/3/library/functions.html#enumerate
 *
 * NOTE: based on the pure JS implementation suggested in https://stackoverflow.com/a/34347308/2753863
 *
 * @template T
 *
 * @param {Iterable<T>} it
 * @param {number} start
 *
 * @returns  {[number, {T}]}
 *
 * @module    enumerate
 * @function  default
 */
export function* enumerate<T>(it: Iterable<T>, start = 0) {
  let i = start
  for (const x of it) {
    const tuple: [number, T] = [i++, x]
    yield tuple
  }
}
