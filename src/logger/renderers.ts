/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as logSymbols from "log-symbols"
import * as nodeEmoji from "node-emoji"
import chalk from "chalk"
import { curryRight, flow, padEnd, padStart } from "lodash"
import hasAnsi = require("has-ansi")

import { duration } from "./util"

import { LogSymbolType, EntryStyle } from "./types"
import { LogEntry } from "./index"

export type Renderers = [() => string, any[]][]

/*** STYLE HELPERS ***/

const sectionPrefixWidth = 18
const truncate = (s: string) => s.length > sectionPrefixWidth
  ? `${s.substring(0, sectionPrefixWidth - 3)}...`
  : s
const sectionStyle = (s: string) => chalk.cyan.italic(padEnd(truncate(s), sectionPrefixWidth))
const msgStyle = (s: string) => hasAnsi(s) ? s : chalk.gray(s)
const errorStyle = (s: string) => hasAnsi(s) ? s : chalk.red(s)

/*** RENDER HELPERS ***/
function insertVal(out: string[], idx: number, renderFn: Function, renderArgs: any[]): string[] {
  out[idx] = renderFn(...renderArgs)
  return out
}

// Creates a chain of renderers that each receives the updated output array along with the provided parameters
function applyRenderers(renderers: Renderers): Function {
  const curried = renderers.map((p, idx) => {
    const args = [idx, p[0], p[1]]
    // FIXME Currying like this throws "Expected 0-4 arguments, but got 0 or more"
    return (<any>curryRight)(insertVal)(...args)
  })
  return flow(curried)
}

// Accepts a list of tuples containing a render functions and it's args: [renderFn, [arguments]]
export function format(renderers: Renderers): string {
  const initOutput = []
  return applyRenderers(renderers)(initOutput).join("")
}

/*** RENDERERS ***/
export function leftPad(entry: LogEntry): string {
  return padStart("", entry.depth * 3)
}

export function renderEmoji(entry: LogEntry): string {
  const { emoji } = entry.opts
  if (emoji && nodeEmoji.hasEmoji(emoji)) {
    return `${nodeEmoji.get(emoji)}  `
  }
  return ""
}

export function renderError(entry: LogEntry) {
  const { error } = entry.opts
  if (error) {
    return error.stack
  }
  return ""
}

export function renderSymbol(entry: LogEntry): string {
  const { symbol } = entry.opts
  if (symbol === LogSymbolType.empty) {
    return " "
  }
  return symbol ? `${logSymbols[symbol]} ` : ""
}

export function renderMsg(entry: LogEntry): string {
  const { entryStyle, msg } = entry.opts
  const styleFn = entryStyle === EntryStyle.error ? errorStyle : msgStyle
  if (msg && msg instanceof Array) {
    return msg.map(styleFn).join(chalk.gray(" → "))
  }
  return msg ? styleFn(msg) : ""
}

export function renderSection(entry: LogEntry): string {
  const { section } = entry.opts
  return section ? `${sectionStyle(section)} → ` : ""
}

export function renderDuration(entry: LogEntry): string {
  const { showDuration = false } = entry.opts
  return showDuration
    ? msgStyle(` (finished in ${duration(entry.timestamp)}s)`)
    : ""
}
