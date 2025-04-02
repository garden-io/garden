/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

export const objectSpreadKey = "$merge"
export const conditionalKey = "$if"
export const conditionalThenKey = "$then"
export const conditionalElseKey = "$else"
export const arrayConcatKey = "$concat"
export const arrayForEachKey = "$forEach"
export const arrayForEachReturnKey = "$return"
export const arrayForEachFilterKey = "$filter"

const specialKeys = [
  objectSpreadKey,
  conditionalKey,
  conditionalThenKey,
  conditionalElseKey,
  arrayConcatKey,
  arrayForEachKey,
  arrayForEachReturnKey,
  arrayForEachFilterKey,
]
export function isSpecialKey(input: string): boolean {
  return specialKeys.some((key) => input === key)
}

export const absolutePathRegex = /^\/.*/ // Note: Only checks for the leading slash
// from https://stackoverflow.com/a/12311250/3290965
export const identifierRegex = /^(?![0-9]+$)(?!.*-$)(?!-)[a-z0-9-]{1,63}$/
export const userIdentifierRegex = /^(?!garden)(?=.{1,63}$)[a-z][a-z0-9]*(-[a-z0-9]+)*$/
export const envVarRegex = /^(?!garden)[a-z_][a-z0-9_\.]*$/i
export const gitUrlRegex = /(?:git|ssh|https?|git@[-\w.]+):(\/\/)?(.*?)(\/?|\#[-\d\w._\/]+?)$/
export const variableNameRegex = /[a-zA-Z][a-zA-Z0-9_\-]*/i

export const joiIdentifierDescription =
  "valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a letter, " +
  "and cannot end with a dash) and must not be longer than 63 characters."
