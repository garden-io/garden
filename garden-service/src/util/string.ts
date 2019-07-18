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

export type GardenAnnotationKey = "generated" | "module" | "moduleVersion" | "service" | "task" | "test" | "version"

export function gardenAnnotationKey(key: GardenAnnotationKey) {
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
