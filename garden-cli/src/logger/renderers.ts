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
import {
  curryRight,
  flow,
  isArray,
  isEmpty,
  padEnd,
  padStart,
  reduce,
  kebabCase,
} from "lodash"
import hasAnsi = require("has-ansi")

import { LogSymbolType, EntryStyle } from "./types"
import { LogEntry } from "./logger"

export type ToRender = string | ((...args: any[]) => string)
export type Renderer = [ToRender, any[]] | ToRender[]
export type Renderers = Renderer[]

/*** STYLE HELPERS ***/

const sectionPrefixWidth = 18
const truncate = (s: string) => s.length > sectionPrefixWidth
  ? `${s.substring(0, sectionPrefixWidth - 3)}...`
  : s
const sectionStyle = (s: string) => chalk.cyan.italic(padEnd(truncate(s), sectionPrefixWidth))
const msgStyle = (s: string) => hasAnsi(s) ? s : chalk.gray(s)
const errorStyle = chalk.red

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

/*** RENDERERS ***/
export function leftPad(entry: LogEntry): string {
  const { parentEntry } = entry
  if (parentEntry && parentEntry.opts.unindentChildren) {
    return ""
  }
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
  const { msg, error } = entry.opts
  if (error) {
    const { detail, message, stack } = error
    let out = stack || message
    if (!isEmpty(detail)) {
      const kebabCasedDetail = reduce(detail, (acc, val, key) => {
        acc[kebabCase(key)] = val
        return acc
      }, {})
      const yamlDetail = yaml.safeDump(kebabCasedDetail, { noRefs: true, skipInvalid: true })
      out += `\nError Details:\n${yamlDetail}`
    }
    return out
  }
  return msg || ""
}

export function renderSymbol(entry: LogEntry): string {
  const { symbol } = entry.opts
  if (symbol === LogSymbolType.empty) {
    return " "
  }
  return symbol ? `${logSymbols[symbol]} ` : ""
}

export function renderMsg(entry: LogEntry): string {
  const { entryStyle, fromStdStream, msg } = entry.opts

  if (fromStdStream) {
    return isArray(msg) ? msg.join(" ") : msg || ""
  }

  const styleFn = entryStyle === EntryStyle.error ? errorStyle : msgStyle
  if (isArray(msg)) {
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
    ? msgStyle(` (finished in ${entry.getDuration()}s)`)
    : ""
}

export function formatForTerminal(entry: LogEntry): string {
  let renderers
  if (entry.depth > 0) {
    // Skip section on child entries.
    renderers = [
      [leftPad, [entry]],
      [renderSymbol, [entry]],
      [renderEmoji, [entry]],
      [renderMsg, [entry]],
      [renderDuration, [entry]],
      ["\n"],
    ]
  } else {
    renderers = [
      [renderSymbol, [entry]],
      [renderSection, [entry]],
      [renderEmoji, [entry]],
      [renderMsg, [entry]],
      [renderDuration, [entry]],
      ["\n"],
    ]
  }
  return combine(renderers)
}
