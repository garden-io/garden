/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as logSymbols from "log-symbols"
import * as yaml from "js-yaml"
import chalk from "chalk"
import stripAnsi from "strip-ansi"
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

import { LogEntry, MessageState } from "./log-entry"
import { JsonLogEntry } from "./writers/json-terminal-writer"
import { highlightYaml, deepFilter } from "../util/util"
import { isNumber } from "util"
import { printEmoji, sanitizeObject } from "./util"

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
export const errorStyle = (s: string) => hasAnsi(s) ? s : chalk.red(s)

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

/**
 * Returns the most recent message's `msg` field if it has `append` set to `false`.
 * Otherwise returns longest chain of messages with `append: true` (starting from the most recent message).
 */
export function chainMessages(messageStates: MessageState[], chain: string[] = []): string | string[] {
  const latestState = messageStates[messageStates.length - 1]
  if (!latestState) {
    return chain.length === 1 ? chain[0] : chain.reverse()
  }

  chain = latestState.msg !== undefined ? [...chain, latestState.msg] : chain

  if (latestState.append) {
    return chainMessages(messageStates.slice(0, -1), chain)
  }
  return chain.reverse()
}

export function combine(renderers: Renderers): string {
  const initOutput = []
  return applyRenderers(renderers)(initOutput).join("")
}

/*** RENDERERS ***/
export function leftPad(entry: LogEntry): string {
  return "".padStart((entry.indent || 0) * 3)
}

export function renderEmoji(entry: LogEntry): string {
  const { emoji } = entry.getMessageState()
  if (emoji) {
    return printEmoji(emoji, entry) + " "
  }
  return ""
}

export function renderError(entry: LogEntry) {
  const { errorData: error } = entry
  if (error) {
    const { detail, message, stack } = error
    let out = stack || message

    // We recursively filter out internal fields (i.e. having names starting with _).
    const filteredDetail = deepFilter(detail, (_, key: string | number) => {
      return isNumber(key) || !key.startsWith("_")
    })

    if (!isEmpty(filteredDetail)) {
      try {
        const sanitized = sanitizeObject(filteredDetail)
        const yamlDetail = yaml.safeDump(sanitized, { noRefs: true, skipInvalid: true })
        out += `\nError Details:\n${yamlDetail}`
      } catch (err) {
        out += `\nUnable to render error details:\n${err.message}`
      }
    }
    return out
  }

  const msg = chainMessages(entry.getMessageStates() || [])
  return isArray(msg) ? msg.join(" ") : msg || ""
}

export function renderSymbol(entry: LogEntry): string {
  const { symbol } = entry.getMessageState()
  if (symbol === "empty") {
    return " "
  }
  return symbol ? `${logSymbols[symbol]} ` : ""
}

export function renderMsg(entry: LogEntry): string {
  const { fromStdStream } = entry
  const { status } = entry.getMessageState()
  const msg = chainMessages(entry.getMessageStates() || [])

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
  const { data } = entry
  if (!data) {
    return ""
  }
  const asYaml = yaml.safeDump(data, { noRefs: true, skipInvalid: true })
  return highlightYaml(asYaml)
}

export function renderSection(entry: LogEntry): string {
  const { msg, section } = entry.getMessageState()
  if (section && msg) {
    return `${sectionStyle(section)} → `
  } else if (section) {
    return sectionStyle(section)
  }
  return ""
}

export function formatForTerminal(entry: LogEntry): string {
  const { msg, emoji, section, symbol } = entry.getMessageState()
  const empty = [msg, section, emoji, symbol].every(val => val === undefined)
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
  const { data } = entry
  const metadata = entry.getMetadata()
  const { msg, section } = entry.getMessageState()
  return {
    msg: cleanForJSON(msg),
    data,
    metadata,
    section: cleanForJSON(section),
  }
}
