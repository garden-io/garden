/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

// NOTE: copied this from the is-subset package to avoid issues with their package manifest
// (https://github.com/studio-b12/is-subset/pull/9)

/**
 * Check if an object is contained within another object.
 *
 * Returns `true` if:
 * - all enumerable keys of *subset* are also enumerable in *superset*, and
 * - every value assigned to an enumerable key of *subset* strictly equals
 *   the value assigned to the same key of *superset* – or is a subset of it.
 *
 * @param  {Object}  superset
 * @param  {Object}  subset
 *
 * @returns  {Boolean}
 *
 * @module    is-subset
 * @function  default
 * @alias     isSubset
 */

export const isSubset = (superset, subset) => {
  if (typeof superset !== "object" || superset === null || typeof subset !== "object" || subset === null) {
    return false
  }

  if (superset instanceof Date || subset instanceof Date) {
    return superset.valueOf() === subset.valueOf()
  }

  return Object.keys(subset).every((key) => {
    if (!superset.propertyIsEnumerable(key)) {
      return false
    }

    const subsetItem = subset[key]
    const supersetItem = superset[key]
    if (
      typeof subsetItem === "object" && subsetItem !== null
        ? !isSubset(supersetItem, subsetItem)
        : supersetItem !== subsetItem
    ) {
      return false
    }

    return true
  })
}
