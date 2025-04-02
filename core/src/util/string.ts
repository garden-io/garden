/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import _dedent from "dedent"
import _deline from "deline"
import _urlJoin from "proper-url-join"
import _stableStringify from "json-stable-stringify"
import _titleize from "titleize"
import CliTable from "cli-table3"
import type { Options as CliTruncateOptions } from "cli-truncate"
import cliTruncate from "cli-truncate"
import { getTerminalWidth } from "../logger/util.js"
import wrapAnsi from "wrap-ansi"

// Exporting these here for convenience and ease of imports (otherwise we need to require modules instead of using
// the import syntax, and it for some reason doesn't play nice with IDEs).
export const dedent = _dedent
export const deline = _deline
export const urlJoin = _urlJoin as (...args: string[]) => string
export const stableStringify = _stableStringify

// helper to enforce annotating images that we bundle with
// Garden to include the sha256 digest for extra security.
export type DockerImageWithDigest = `${string}:${string}@sha256:${string}`

const gardenAnnotationPrefix = "garden.io/"

export type GardenAnnotationKey =
  | "actionType"
  | "action"
  | "aec-status"
  | "mode"
  | "generated"
  | "helm-migrated"
  | "manifest-hash"
  | "module"
  | "moduleVersion"
  | "service"
  | "task"
  | "test"
  | "version"

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
      if (lineBreakIdx >= 0) {
        return str.substr(lineBreakIdx + 1)
      } else {
        return str.substr(overflow)
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
export function naturalList(list: string[], { trailingWord = "and", quote = false } = {}) {
  if (quote) {
    list = list.map((s) => "'" + s + "'")
  }
  if (list.length === 0) {
    return "<None>"
  } else if (list.length === 1) {
    return list[0]
  } else {
    return list.slice(0, -1).join(", ") + " " + trailingWord + " " + list[list.length - 1]
  }
}

/**
 * Generate a random string of a specified `length`.
 */
export function randomString(length = 8) {
  return [...Array(length)].map(() => (~~(Math.random() * 36)).toString(36)).join("")
}

/**
 * Splits the given string by newlines. Works for both Windows and *nix style breaks.
 */
export function splitLines(s: string) {
  return s.split(/\r?\n/)
}

type TableRow = CliTable.CrossTableRow | CliTable.HorizontalTableRow | CliTable.VerticalTableRow

export const tablePresets: { [key: string]: CliTable.TableConstructorOptions } = {
  "default": {
    wordWrap: true,
  },
  "no-borders": {
    chars: {
      "top": "",
      "top-mid": "",
      "top-left": "",
      "top-right": "",
      "bottom": "",
      "bottom-mid": "",
      "bottom-left": "",
      "bottom-right": "",
      "left": "",
      "left-mid": "",
      "mid": " ",
      "mid-mid": "",
      "right": "",
      "right-mid": "",
      "middle": "",
    },
    style: {
      compact: true,
    },
    wordWrap: true,
  },
}

export function renderTable(rows: TableRow[], opts: CliTable.TableConstructorOptions = tablePresets.default) {
  const table = new CliTable({ wordWrap: true, ...(opts || {}) })
  // The typings here are a complete mess
  table.push(...(<any>rows))
  return table.toString()
}

/**
 * Line wraps the given text.
 *
 * @param text the text to wrap
 * @param maxWidth the maximum width in characters (the terminal width is used if smaller)
 * @param opts options passed to the `wrapAnsi` library
 */
export function wordWrap(text: string, maxWidth: number, opts: any = {}) {
  const termWidth = getTerminalWidth()
  const width = maxWidth > termWidth ? termWidth : maxWidth
  return wrapAnsi(text, width, opts)
}

/**
 * Truncates the given text, if necessary. Handles ANSI color codes correctly.
 *
 * @param text the text to truncate
 * @param length maximum length of the output text
 * @param opts options passed to `cli-truncate`
 */
export function truncate(text: string, length: number, opts: CliTruncateOptions = {}) {
  return cliTruncate(text, length, opts)
}

/**
 * Strips matching single or double quotes from a string. If a string both starts and ends with a single quote, or
 * if it both starts and ends with a double quote, we strip them. Otherwise the string is returned unchanged.
 *
 * @param string the string to strip
 */
export function stripQuotes(string: string) {
  if (string.length >= 2 && string[0] === string[string.length - 1] && (string[0] === '"' || string[0] === "'")) {
    return string.slice(1, -1)
  } else {
    return string
  }
}

export function titleize(string: string) {
  return _titleize(string)
}

/**
 * Splits the input string on the first occurrence of `delimiter`.
 */
export function splitFirst(s: string, delimiter: string) {
  const parts = s.split(delimiter)
  return [parts[0], parts.slice(1).join(delimiter)]
}

/**
 * Splits the input string on the last occurrence of `delimiter`.
 */
export function splitLast(s: string, delimiter: string) {
  const lastIndex = s.lastIndexOf(delimiter)

  if (lastIndex === -1) {
    return ["", s]
  }

  return [s.slice(0, lastIndex), s.slice(lastIndex + delimiter.length)]
}
