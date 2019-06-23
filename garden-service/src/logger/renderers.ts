/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as logSymbols from "log-symbols"
import * as nodeEmoji from "node-emoji"
import * as yaml from "js-yaml"
import chalk from "chalk"
import stripAnsi from "strip-ansi"
import * as CircularJSON from "circular-json"
import {
  curryRight,
  flow,
  isArray,
  isEmpty,
  repeat,
} from "lodash"
import cliTruncate = require("cli-truncate")
import stringWidth = require("string-width")
import hasAnsi = require("has-ansi")

import { LogEntry, EmojiName } from "./log-entry"
import { JsonLogEntry } from "./writers/json-terminal-writer"
import { highlightYaml } from "../util/util"

export type ToRender = string | ((...args: any[]) => string)
export type Renderer = [ToRender, any[]] | ToRender[]
export type Renderers = Renderer[]

/*** STYLE HELPERS ***/

const SECTION_PREFIX_WIDTH = 25
const cliPadEnd = (s: string, width: number): string => {
  const diff = width - stringWidth(s)
  return diff <= 0 ? s : s + repeat(" ", diff)
}
const truncateSection = (s: string) => cliTruncate(s, SECTION_PREFIX_WIDTH)
const sectionStyle = (s: string) => chalk.cyan.italic(cliPadEnd(truncateSection(s), SECTION_PREFIX_WIDTH))
export const msgStyle = (s: string) => hasAnsi(s) ? s : chalk.gray(s)
export const errorStyle = chalk.red

/*** RENDER HELPERS ***/
function insertVal(out: string[], idx: number, toRender: Function | string, renderArgs: any[]): string[] {
  out[idx] = typeof toRender === "string" ? toRender : toRender(...renderArgs)
  return out
}

// Creates a chain of renderers that each receives the updated output array along with the provided parameters
function applyRenderers(renderers: Renderers): Function {
  const curried = renderers.map(([toRender, renderArgs]: Renderer, idx: number) => {
    const args = [idx, toRender, renderArgs]
    // FIXME Currying like this throws "Expected 0-4 arguments, but got 0 or more"
    return (<any>curryRight)(insertVal)(...args)
  })
  return flow(curried)
}

export function combine(renderers: Renderers): string {
  const initOutput = []
  return applyRenderers(renderers)(initOutput).join("")
}

export function printEmoji(emoji: EmojiName) {
  if (nodeEmoji.hasEmoji(emoji)) {
    return `${nodeEmoji.get(emoji)}  `
  }
  return ""
}

/*** RENDERERS ***/
export function leftPad(entry: LogEntry): string {
  return "".padStart((entry.opts.indent || 0) * 3)
}

export function renderEmoji(entry: LogEntry): string {
  const { emoji } = entry.opts
  if (emoji && entry.root.useEmoji) {
    return printEmoji(emoji)
  }
  return ""
}

export function renderError(entry: LogEntry) {
  const { msg, error } = entry.opts
  if (error) {
    const { detail, message, stack } = error
    let out = stack || message

    const sanitized = JSON.parse(CircularJSON.stringify(detail))

    if (!isEmpty(detail)) {
      try {
        const yamlDetail = yaml.safeDump(sanitized, { noRefs: true, skipInvalid: true })
        out += `\nError Details:\n${yamlDetail}`
      } catch (err) {
        out += `\nUnable to render error details:\n${err.message}`
      }
    }
    return out
  }
  return isArray(msg) ? msg.join(" ") : msg || ""
}

export function renderSymbol(entry: LogEntry): string {
  const { symbol } = entry.opts
  if (symbol === "empty") {
    return " "
  }
  return symbol ? `${logSymbols[symbol]} ` : ""
}

export function renderMsg(entry: LogEntry): string {
  const { fromStdStream, msg, status } = entry.opts

  if (fromStdStream) {
    return isArray(msg) ? msg.join(" ") : msg || ""
  }

  const styleFn = status === "error" ? errorStyle : msgStyle
  if (isArray(msg)) {
    // We apply the style function to each item (as opposed to the entire string) in case some
    // part of the message already has a style
    return msg.map(str => styleFn(str)).join(styleFn(" → "))
  }
  return msg ? styleFn(msg) : ""
}

export function renderData(entry: LogEntry): string {
  const { data } = entry.opts
  if (!data) {
    return ""
  }
  const asYaml = yaml.safeDump(data, { noRefs: true, skipInvalid: true })
  return highlightYaml(asYaml)
}

export function renderSection(entry: LogEntry): string {
  const { msg, section } = entry.opts
  if (section && msg) {
    return `${sectionStyle(section)} → `
  } else if (section) {
    return sectionStyle(section)
  }
  return ""
}

export function renderDuration(entry: LogEntry): string {
  const { showDuration = false } = entry.opts
  return showDuration
    ? msgStyle(` (finished in ${entry.getDuration()}s)`)
    : ""
}

export function formatForTerminal(entry: LogEntry): string {
  const { msg, data, section, emoji, showDuration, symbol } = entry.opts
  const empty = [msg, data, section, emoji, showDuration, symbol].every(val => val === undefined)
  if (empty) {
    return ""
  }
  return combine([
    [leftPad, [entry]],
    [renderSymbol, [entry]],
    [renderSection, [entry]],
    [renderEmoji, [entry]],
    [renderMsg, [entry]],
    [renderData, [entry]],
    [renderDuration, [entry]],
    ["\n"],
  ])
}

export function cleanForJSON(input?: string | string[]): string {
  if (!input) {
    return ""
  }

  const inputStr = isArray(input) ? input.join(" - ") : input
  return stripAnsi(inputStr).trim()
}

export function cleanWhitespace(str) {
  return str.replace(/\s+/g, " ")
}

export function formatForJSON(entry: LogEntry): JsonLogEntry {
  const { msg, data, section, showDuration, metadata } = entry.opts
  return {
    msg: cleanForJSON(msg),
    data,
    metadata,
    section: cleanForJSON(section),
    durationMs: showDuration ? entry.getDuration(3) * 1000 : undefined,
  }
}
