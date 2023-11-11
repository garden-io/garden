/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import logSymbols from "log-symbols"
import stringify from "json-stringify-safe"
import stripAnsi from "strip-ansi"
import { isArray, repeat, trim } from "lodash-es"
import stringWidth from "string-width"
import format from "date-fns/format/index.js"
import type { LogEntry } from "./log-entry.js"
import type { JsonLogEntry } from "./writers/json-terminal-writer.js"
import { highlightYaml, safeDumpYaml } from "../util/serialization.js"
import type { Logger } from "./logger.js"
import { logLevelMap, LogLevel } from "./logger.js"
import { toGardenError } from "../exceptions.js"
import type { Styles } from "./styles.js"
import { styles } from "./styles.js"

type RenderFn = (entry: LogEntry, logger: Logger) => string

export const SECTION_PADDING = 20

export function padSection(section: string, width: number = SECTION_PADDING) {
  const diff = width - stringWidth(section)
  return diff <= 0 ? section : section + repeat(" ", diff)
}

/**
 * Combines the render functions and returns a string with the output value
 */
export function combineRenders(entry: LogEntry, logger: Logger, renderers: RenderFn[]): string {
  return renderers.map((renderer) => renderer(entry, logger)).join("")
}

export function renderError(entry: LogEntry): string {
  const { error, msg } = entry

  let out = ""

  if (!msg && error) {
    out = toGardenError(error).explain()
  } else if (error) {
    const noAnsiErr = stripAnsi(error.message || "")
    const noAnsiMsg = stripAnsi(msg || "")
    // render error only if message doesn't already contain it
    if (!noAnsiMsg?.includes(trim(noAnsiErr, "\n"))) {
      out = "\n\n" + styles.error(error.message)
    }
  }

  return out
}

export function renderSymbol(entry: LogEntry): string {
  const section = getSection(entry)

  if (!section) {
    return ""
  }

  let symbol = entry.symbol

  if (symbol === "empty") {
    return "  "
  }

  if (symbol === "cached") {
    return styles.highlightSecondary.bold("🞦 ")
    // return styles.highlightSecondary.bold("🌸")
  }

  // Always show symbol with sections
  if (!symbol && section) {
    symbol = "info"
  }

  return symbol ? `${logSymbols[symbol]} ` : ""
}

export function renderTimestamp(entry: LogEntry, logger: Logger): string {
  if (!logger.showTimestamps) {
    return ""
  }
  const formattedDate = format(new Date(entry.timestamp), "HH:mm:ss")
  return styles.secondary(formattedDate) + " "
}

export function getStyle(level: LogLevel) {
  let style: Styles
  if (level === LogLevel.error) {
    style = styles.error
  } else if (level === LogLevel.warn) {
    style = styles.warning
  } else if (level === LogLevel.info) {
    style = styles.primary
  } else {
    style = styles.secondary
  }

  return style
}
export function getSection(entry: LogEntry): string | null {
  if (entry.context.type === "actionLog") {
    return `${entry.context.actionKind.toLowerCase()}.${entry.context.actionName}`
  } else if (entry.context.type === "coreLog" && entry.context.name) {
    return entry.context.name
  }
  return null
}

export function renderMsg(entry: LogEntry): string {
  const { context, level, msg } = entry
  const { origin } = context
  const style = getStyle(level)

  if (!msg) {
    return ""
  }

  // TODO: @eysi Should we strip here?
  // if (level > LogLevel.info) {
  //   msg = stripAnsi(msg)
  // }

  return style(origin ? `[${styles.italic(origin)}] ` + msg : msg)
}

export function renderData(entry: LogEntry): string {
  const { data, dataFormat } = entry
  if (!data) {
    return ""
  }
  if (!dataFormat || dataFormat === "yaml") {
    const asYaml = safeDumpYaml(data, { noRefs: true })
    return highlightYaml(asYaml)
  }
  return stringify(data, null, 2)
}

export function renderSection(entry: LogEntry): string {
  const { msg } = entry
  let section = getSection(entry)

  // For log levels higher than "info" we print the log level name.
  // This should technically happen when we render the symbol but it's harder
  // to deal with the padding that way.
  const logLevelName = styles.secondary(`[${logLevelMap[entry.level]}]`)

  // Just print the log level name directly without padding. E.g:
  // ℹ api                       → Deploying version v-37d6c44559...
  // [verbose] Some verbose level stuff that doesn't have a section
  if (!section && entry.level > LogLevel.info) {
    return logLevelName + " "
  }

  // Print the log level name after the section name to preserve alignment. E.g.:
  // ℹ api                       → Deploying version v-37d6c44559...
  // ℹ api [verbose]             → Some verbose level stuff that has a section
  if (entry.level > LogLevel.info) {
    section = section ? `${section} ${logLevelName}` : logLevelName
  }

  if (section && msg) {
    return `${styles.section(padSection(section))} ${styles.accent.bold("→")} `
  } else if (section) {
    return styles.section(padSection(section))
  }
  return ""
}

/**
 * Formats entries for the terminal writer.
 */
export function formatForTerminal(entry: LogEntry, logger: Logger): string {
  const { msg: msg, symbol, data, error } = entry
  const empty = [msg, symbol, data, error].every((val) => val === undefined)

  if (empty) {
    return ""
  }

  return combineRenders(entry, logger, [
    renderTimestamp,
    renderSymbol,
    renderSection,
    renderMsg,
    renderError,
    renderData,
    () => "\n",
  ])
}

export function cleanForJSON(input?: string | string[]): string {
  if (!input) {
    return ""
  }

  const inputStr = isArray(input) ? input.join(" - ") : input
  return stripAnsi(inputStr).trim()
}

export function cleanWhitespace(str: string) {
  return str.replace(/\s+/g, " ")
}

// TODO: Include individual message states with timestamp
export function formatForJson(entry: LogEntry): JsonLogEntry {
  const { msg, metadata, timestamp } = entry
  const errorDetail = entry.error && entry ? toGardenError(entry.error).toString(true) : undefined
  const section = renderSection(entry)

  const jsonLogEntry: JsonLogEntry = {
    msg: cleanForJSON(msg),
    data: entry.data,
    metadata,
    // TODO @eysi: Should we include the section here or rather just show the context?
    section: cleanForJSON(section),
    timestamp,
    level: logLevelMap[entry.level],
  }
  if (errorDetail) {
    jsonLogEntry.errorDetail = errorDetail
  }
  return jsonLogEntry
}
