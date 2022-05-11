/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import _dedent = require("dedent")
import _deline = require("deline")
import _urlJoin = require("proper-url-join")
import _stableStringify = require("json-stable-stringify")
import CliTable from "cli-table3"
import cliTruncate from "cli-truncate"
import { getTerminalWidth } from "../logger/util"
import wrapAnsi from "wrap-ansi"

// Exporting these here for convenience and ease of imports (otherwise we need to require modules instead of using
// the import syntax, and it for some reason doesn't play nice with IDEs).
export const dedent = _dedent
export const deline = _deline
export const urlJoin = _urlJoin as (...args: string[]) => string
export const stableStringify = _stableStringify

const gardenAnnotationPrefix = "garden.io/"

export type GardenAnnotationKey =
  | "dev-mode"
  | "generated"
  | "helm-migrated"
  | "hot-reload"
  | "local-mode"
  | "manifest-hash"
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
export function naturalList(list: string[]) {
  if (list.length === 0) {
    return ""
  } else if (list.length === 1) {
    return list[0]
  } else {
    return list.slice(0, -1).join(", ") + " and " + list[list.length - 1]
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
export function truncate(text: string, length: number, opts: cliTruncate.Options = {}) {
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
