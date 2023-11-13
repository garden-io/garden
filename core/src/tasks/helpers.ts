/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { isArray, isObject, mapKeys, mapValues, omit, pickBy, remove } from "lodash-es"
import minimatch from "minimatch"
import type { ActionConfig } from "../actions/types.js"
import type { GraphResults } from "../graph/results.js"
import type { DeployStatus } from "../plugin/handlers/Deploy/get-status.js"
import { splitLast } from "../util/string.js"

export function getDeployStatuses(dependencyResults: GraphResults): { [name: string]: DeployStatus } {
  const deployResults = pickBy(dependencyResults.getMap(), (r) => r && r.type === "deploy")
  const statuses = mapValues(deployResults, (r) => omit(r!.result, "version") as DeployStatus)
  return mapKeys(statuses, (_, key) => splitLast(key, ".")[1])
}

/**
 * Find all the paths that should be excluded from the action config based on the config.
 */
export function findCacheKeyPathsToExcludeFromConfig(config: ActionConfig): string[] {
  const cacheExcludeSpecifiedPaths = config.cache?.exclude?.paths ?? []
  const matchedPaths: string[] = []
  if (cacheExcludeSpecifiedPaths.length > 0) {
    // only do recursive matching if path is a wildcard
    // wildcard can only be in the beginning or in the middle of the path. e.g. *.foo or foo.*.bar
    // We validate the paths in the config schema, so we don't need to validate here.
    const pathsWithWildcards = remove(cacheExcludeSpecifiedPaths, (p) => p.includes(".*.") || p.includes("*."))
    const pathsWithWildcardsResolved = findMatchingKeyPathsFromWildcardPaths(config, pathsWithWildcards)
    matchedPaths.push(...cacheExcludeSpecifiedPaths, ...pathsWithWildcardsResolved)
  }
  return matchedPaths
}

/**
 * Recursively traverse a JSON object and identify paths that match the patterns.
 * @param {string[]} excludePatterns - An array of strings representing the patterns.
 * @param {object|array} jsonObject - Input JSON object to be traversed
 * @param {string} [currentPath=''] - The current path during recursive traversal.
 * @returns {string[]} - Array of strings representing key paths in the JSON object that match the patterns.
 */
export function findMatchingKeyPathsFromWildcardPaths(
  jsonObject: {},
  excludePatterns: string[],
  currentPath = ""
): string[] {
  let matchedPaths: string[] = []
  // Iterate over the elements of the object or array
  for (const [key, value] of Object.entries(jsonObject)) {
    const newPath = currentPath ? `${currentPath}.${key}` : key
    if (excludePatterns.some((pattern) => minimatch(newPath, pattern))) {
      // If matched, add the path to the array
      matchedPaths.push(newPath)
    } else if (isObject(value) || isArray(value)) {
      // If not matched, recursively call the function for the nested value
      const nestedMatches = findMatchingKeyPathsFromWildcardPaths(value, excludePatterns, newPath)
      // Concatenate the nested matches to the matched paths array
      matchedPaths = matchedPaths.concat(nestedMatches)
    }
  }
  return matchedPaths
}
