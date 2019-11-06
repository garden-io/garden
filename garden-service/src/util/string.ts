/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import _dedent = require("dedent")
import _deline = require("deline")
import _urlJoin = require("proper-url-join")

// Exporting these here for convenience and ease of imports (otherwise we need to require modules instead of using
// the import syntax, and it for some reason doesn't play nice with IDEs).
export const dedent = _dedent
export const deline = _deline
export const urlJoin = _urlJoin as (...args: string[]) => string

const gardenAnnotationPrefix = "garden.io/"

export type GardenAnnotationKey =
  | "generated"
  | "last-applied-configuration"
  | "hot-reload"
  | "module"
  | "moduleVersion"
  | "service"
  | "task"
  | "test"
  | "version"

export function gardenAnnotationKey(key: GardenAnnotationKey) {
  // FIXME: We need to work out a transition for existing deployments, but we had previously set these two keys
  // without the prefix and K8s doesn't allow modifying label selectors on existing workloads. (yay.)
  if (key === "module" || key === "service") {
    return key
  }
  return gardenAnnotationPrefix + key
}

/**
 * Truncates the first n characters from a string where n equals the number by
 * which the string byte length exceeds the `maxLength`.
 *
 * Optionally scan towards the next line break after trimming the bytes, and trim to there.
 *
 * Note that a UTF-8 character can be 1-4 bytes so this is a naive but inexpensive approach.
 */
export function tailString(str: string, maxLength: number, nextLine = false) {
  const overflow = Buffer.byteLength(str, "utf8") - maxLength
  if (overflow > 0) {
    if (nextLine) {
      const lineBreakIdx = str.indexOf("\n", overflow)
      if (lineBreakIdx) {
        return str.substr(lineBreakIdx + 1)
      }
    }
    return str.substr(overflow)
  }
  return str
}

export function base64(str: string) {
  return Buffer.from(str).toString("base64")
}

/**
 * Returns an array of strings, joined together as a string in a natural language manner.
 * Example: `naturalList(["a", "b", "c"])` -> `"a, b and c"`
 */
export function naturalList(list: string[]) {
  if (list.length === 0) {
    return ""
  } else if (list.length === 1) {
    return list[0]
  } else {
    return list.slice(0, -1).join(", ") + " and " + list[list.length - 1]
  }
}
