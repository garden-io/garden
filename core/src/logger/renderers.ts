/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import logSymbols from "log-symbols"
import chalk from "chalk"
import stripAnsi from "strip-ansi"
import { isArray, repeat } from "lodash"
import stringWidth = require("string-width")
import hasAnsi = require("has-ansi")

import { LogEntry, LogEntryMessage } from "./log-entry"
import { JsonLogEntry } from "./writers/json-terminal-writer"
import { highlightYaml, PickFromUnion, safeDumpYaml } from "../util/util"
import { printEmoji, formatGardenError } from "./util"
import { LoggerType, Logger } from "./logger"

type RenderFn = (entry: LogEntry) => string

/*** STYLE HELPERS ***/

export const SECTION_PADDING = 25

export function padSection(section: string, width: number = SECTION_PADDING) {
  const diff = width - stringWidth(section)
  return diff <= 0 ? section : section + repeat(" ", diff)
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
 * Returns a log entries' left margin/offset. Used for determining the spinner's x coordinate.
 */
export function getLeftOffset(entry: LogEntry) {
  return leftPad(entry).length
}

/**
 * Returns longest chain of messages with `append: true` (starting from the most recent message).
 */
export function chainMessages(messages: LogEntryMessage[], chain: string[] = []): string[] {
  const latestState = messages[messages.length - 1]
  if (!latestState) {
    return chain.reverse()
  }

  chain = latestState.msg !== undefined ? [...chain, latestState.msg] : chain

  if (latestState.append) {
    return chainMessages(messages.slice(0, -1), chain)
  }
  return chain.reverse()
}

/*** RENDERERS ***/
export function leftPad(entry: LogEntry): string {
  return "".padStart((entry.indent || 0) * 3)
}

export function renderEmoji(entry: LogEntry): string {
  const { emoji } = entry.getLatestMessage()
  if (emoji) {
    return printEmoji(emoji, entry) + " "
  }
  return ""
}

export function renderError(entry: LogEntry) {
  const { errorData: error } = entry
  if (error) {
    return formatGardenError(error)
  }

  const msg = chainMessages(entry.getMessages() || [])
  return isArray(msg) ? msg.join(" ") : msg || ""
}

export function renderSymbolBasic(entry: LogEntry): string {
  let { symbol, status } = entry.getLatestMessage()

  if (symbol === "empty") {
    return " "
  }
  if (status === "active" && !symbol) {
    symbol = "info"
  }

  return symbol ? `${logSymbols[symbol]} ` : ""
}

export function renderSymbol(entry: LogEntry): string {
  const { symbol } = entry.getLatestMessage()

  if (symbol === "empty") {
    return " "
  }
  return symbol ? `${logSymbols[symbol]} ` : ""
}

export function renderTimestamp(entry: LogEntry): string {
  if (!entry.root.showTimestamps) {
    return ""
  }
  return `[${getTimestamp(entry)}] `
}

export function getTimestamp(entry: LogEntry): string {
  const { timestamp } = entry.getLatestMessage()
  let formatted = ""
  try {
    formatted = timestamp.toISOString()
  } catch (_err) {}

  return formatted
}

export function renderMsg(entry: LogEntry): string {
  const { fromStdStream } = entry
  const { status } = entry.getLatestMessage()
  const msg = chainMessages(entry.getMessages() || [])

  if (fromStdStream) {
    return msg.join(" ")
  }

  const styleFn = status === "error" ? errorStyle : msgStyle

  // We apply the style function to each item (as opposed to the entire string) in case some
  // part of the message already has a style
  return msg.map((str) => styleFn(str)).join(styleFn(" → "))
}

export function renderData(entry: LogEntry): string {
  const { data, dataFormat } = entry.getLatestMessage()
  if (!data) {
    return ""
  }
  if (!dataFormat || dataFormat === "yaml") {
    const asYaml = safeDumpYaml(data, { noRefs: true })
    return highlightYaml(asYaml)
  }
  return JSON.stringify(data, null, 2)
}

export function renderSection(entry: LogEntry): string {
  const style = chalk.cyan.italic
  const { msg: msg, section } = entry.getLatestMessage()
  if (section && msg) {
    return `${style(padSection(section))} → `
  } else if (section) {
    return style(padSection(section))
  }
  return ""
}

/**
 * Formats entries for both fancy writer and basic terminal writer.
 */
export function formatForTerminal(entry: LogEntry, type: PickFromUnion<LoggerType, "fancy" | "basic">): string {
  const { msg: msg, emoji, section, symbol, data } = entry.getLatestMessage()
  const empty = [msg, section, emoji, symbol, data].every((val) => val === undefined)

  if (entry.isPlaceholder || empty) {
    return ""
  }

  if (type === "basic") {
    return combineRenders(entry, [
      renderTimestamp,
      leftPad,
      renderSymbolBasic,
      renderSection,
      renderEmoji,
      renderMsg,
      renderData,
      () => "\n",
    ])
  }

  return combineRenders(entry, [leftPad, renderSymbol, renderSection, renderEmoji, renderMsg, renderData, () => "\n"])
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
  const { section, data } = entry.getLatestMessage()
  const metadata = entry.getMetadata()
  const msg = chainMessages(entry.getMessages() || [])
  return {
    msg: cleanForJSON(msg),
    data,
    metadata,
    section: cleanForJSON(section),
    timestamp: getTimestamp(entry),
  }
}
