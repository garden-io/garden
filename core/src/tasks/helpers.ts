/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { forOwn, includes, isArray, isPlainObject, isString, mapKeys, mapValues, omit, pickBy, some } from "lodash-es"
import type { GraphResults } from "../graph/results.js"
import type { DeployStatus } from "../plugin/handlers/Deploy/get-status.js"
import { splitLast } from "../util/string.js"
import { ActionConfig } from "../actions/types.js"

export function getDeployStatuses(dependencyResults: GraphResults): { [name: string]: DeployStatus } {
  const deployResults = pickBy(dependencyResults.getMap(), (r) => r && r.type === "deploy")
  const statuses = mapValues(deployResults, (r) => omit(r!.result, "version") as DeployStatus)
  return mapKeys(statuses, (_, key) => splitLast(key, ".")[1])
}

/**
 * Find keys in a action config object whose values include one of the strings ignoreVars array.
 *
 * @param {Object} config - Action config object.
 * @param {Array} ignoreVars - An array of strings to match against values in the config object.
 * @returns {Array} - An array of objects, each containing the matching key and the string that caused the match.
 */
export function computeKeyPathsToIgnoreFromConfig(
  config: ActionConfig,
  ignoreVars: string[]
): Array<{ key: string; matchedValue: string }> {
  if (ignoreVars.length === 0) {
    return []
  }
  const result: Array<{ key: string; matchedValue: string }> = []
  // recursively search the config object for keys whose values include one of the strings in ignoreVars
  const searchObject = (obj: {}, keyPath: (string | number)[]) => {
    if (isPlainObject(obj) || isArray(obj)) {
      forOwn(obj, (value: string, key: string | number) => {
        const currentKeyPath = keyPath.concat(key)
        if (
          (isString(value) || includes(ignoreVars, value)) &&
          some(ignoreVars, (item: string) => value.includes(item))
        ) {
          result.push({ key: currentKeyPath.join("."), matchedValue: value })
        } else {
          searchObject(value, currentKeyPath)
        }
      })
    }
  }
  searchObject(omit(config, "internal"), [])
  // also include variable declarations to be omitted
  ignoreVars.forEach((v) => {
    if (config.variables?.[v]) {
      result.push({ key: `variables.${v}`, matchedValue: config.variables[v]?.toString() ?? "" })
    }
  })
  return result
}
