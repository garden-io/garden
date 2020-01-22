/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import logSymbols from "log-symbols"
import yaml from "js-yaml"
import chalk from "chalk"
import stripAnsi from "strip-ansi"
import { isArray, isEmpty, repeat } from "lodash"
import cliTruncate = require("cli-truncate")
import stringWidth = require("string-width")
import hasAnsi = require("has-ansi")

import { LogEntry, MessageState } from "./log-entry"
import { JsonLogEntry } from "./writers/json-terminal-writer"
import { highlightYaml, deepFilter, PickFromUnion } from "../util/util"
import { isNumber } from "util"
import { printEmoji, sanitizeObject } from "./util"
import { LoggerType, Logger } from "./logger"

type RenderFn = (entry: LogEntry) => string

/*** STYLE HELPERS ***/

export const MAX_SECTION_WIDTH = 25
const cliPadEnd = (s: string, width: number): string => {
  const diff = width - stringWidth(s)
  return diff <= 0 ? s : s + repeat(" ", diff)
}

function styleSection(section: string, width: number = MAX_SECTION_WIDTH) {
  const minWidth = Math.min(width, MAX_SECTION_WIDTH)
  const formattedSection = [section]
    .map((s) => cliTruncate(s, minWidth))
    .map((s) => cliPadEnd(s, minWidth))
    .pop()
  return chalk.cyan.italic(formattedSection)
}

export const msgStyle = (s: string) => (hasAnsi(s) ? s : chalk.gray(s))
export const errorStyle = (s: string) => (hasAnsi(s) ? s : chalk.red(s))

/*** RENDER HELPERS ***/

/**
 * Combines the render functions and returns a string with the output value
 */
export function combineRenders(entry: LogEntry, renderers: RenderFn[]): string {
  return renderers.map((renderer) => renderer(entry)).join("")
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

export function renderSymbolBasic(entry: LogEntry): string {
  let { symbol, status } = entry.getMessageState()

  if (symbol === "empty") {
    return " "
  }
  if (status === "active" && !symbol) {
    symbol = "info"
  }

  return symbol ? `${logSymbols[symbol]} ` : ""
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
    return msg.map((str) => styleFn(str)).join(styleFn(" → "))
  }
  return msg ? styleFn(msg) : ""
}

export function renderData(entry: LogEntry): string {
  const { data, dataFormat } = entry.getMessageState()
  if (!data) {
    return ""
  }
  if (!dataFormat || dataFormat === "yaml") {
    const asYaml = yaml.safeDump(data, { noRefs: true, skipInvalid: true })
    return highlightYaml(asYaml)
  }
  return JSON.stringify(data, null, 2)
}

export function renderSection(entry: LogEntry): string {
  const { msg, section, maxSectionWidth } = entry.getMessageState()
  if (section && msg) {
    return `${styleSection(section, maxSectionWidth)} → `
  } else if (section) {
    return styleSection(section, maxSectionWidth)
  }
  return ""
}

/**
 * Formats entries for both fancy writer and basic terminal writer.
 */
export function formatForTerminal(entry: LogEntry, type: PickFromUnion<LoggerType, "fancy" | "basic">): string {
  const { msg, emoji, section, symbol, data } = entry.getMessageState()
  const empty = [msg, section, emoji, symbol, data].every((val) => val === undefined)
  if (empty) {
    return ""
  }

  const symbolRenderFn = type === "basic" ? renderSymbolBasic : renderSymbol

  return combineRenders(entry, [leftPad, symbolRenderFn, renderSection, renderEmoji, renderMsg, renderData, () => "\n"])
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

export function basicRender(entry: LogEntry, logger: Logger): string | null {
  if (logger.level >= entry.level) {
    return formatForTerminal(entry, "basic")
  }
  return null
}

// TODO: Include individual message states with timestamp
export function formatForJson(entry: LogEntry): JsonLogEntry {
  const { section, data } = entry.getMessageState()
  const metadata = entry.getMetadata()
  const msg = chainMessages(entry.getMessageStates() || [])
  return {
    msg: cleanForJSON(msg),
    data,
    metadata,
    section: cleanForJSON(section),
  }
}
