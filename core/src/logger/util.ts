/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk, { Chalk } from "chalk"
// import { formatGardenErrorWithDetail } from "./logger"
import { Log, LogEntryMessage } from "./log-entry"
import hasAnsi from "has-ansi"
import dedent from "dedent"
import stringWidth from "string-width"
import { GardenError } from "../exceptions"
import { deepFilter, safeDumpYaml } from "../util/util"
import { isArray, isEmpty, isPlainObject, mapValues } from "lodash"
import { Logger } from "./logger"
import { isPrimitive } from "../config/common"

// Add platforms/terminals?
export function envSupportsEmoji() {
  return (
    process.platform === "darwin" || process.env.TERM_PROGRAM === "Hyper" || process.env.TERM_PROGRAM === "HyperTerm"
  )
}

export interface LogLike {
  entries: any[]
}

export type ProcessLog<T extends LogLike = LogLike> = (node: T) => boolean

export function findParentEntry(log: Log, predicate: ProcessLog<Log>): Log | null {
  return predicate(log) ? log : log.parent ? findParentEntry(log.parent, predicate) : null
}

export function getAllSections(entry: Log, msg: LogEntryMessage) {
  const sections: string[] = []
  let parent = entry.parent

  while (parent) {
    const s = parent.getLatestEntry().section
    s && sections.push(s)
    parent = parent.parent
  }

  msg.section && sections.push(msg.section)

  return sections
}

/**
 * Returns the entry's section or first parent section it finds.
 */
export function findSection(entry: Log): string | null {
  const section = entry.getLatestEntry().section
  if (section) {
    return section
  }
  if (entry.parent) {
    return findSection(entry.parent)
  }

  return null
}

export let overrideTerminalWidth: number | undefined

export function getTerminalWidth(stream: NodeJS.WriteStream = process.stdout) {
  // Used for unit tests
  if (overrideTerminalWidth) {
    return overrideTerminalWidth
  }

  const columns = (stream || {}).columns

  if (!columns) {
    return 80
  }

  // Windows appears to wrap a character early
  if (process.platform === "win32") {
    return columns - 1
  }

  return columns
}

/**
 * Prints emoji if supported and adds padding to the right (otherwise subsequent text flows over the emoji).
 */
export function printEmoji(emoji: string, log: Log) {
  if (log.root.useEmoji) {
    return `${emoji} `
  }
  return ""
}

export function printHeader(log: Log, command: string, emoji: string): void {
  log.info(chalk.bold.magenta(command) + " " + printEmoji(emoji, log))
  log.info("") // Print new line after header
}

export function printFooter(log: Log) {
  log.info("") // Print new line before footer
  return log.info(chalk.bold.magenta("Done!") + " " + printEmoji("✔️", log))
}

export function printWarningMessage(log: Log, text: string) {
  return log.warn(chalk.bold.yellow(text))
}

/**
 * Strips undefined values, internal objects and circular references from an object.
 */
export function sanitizeValue(value: any, _parents?: WeakSet<any>): any {
  if (!_parents) {
    _parents = new WeakSet()
  } else if (_parents.has(value)) {
    return "[Circular]"
  }

  if (value === null || value === undefined) {
    return value
  } else if (Buffer.isBuffer(value)) {
    return "<Buffer>"
  } else if (value instanceof Logger) {
    return "<Logger>"
  } else if (value instanceof Log) {
    return "<Log>"
    // This is hacky but fairly reliably identifies a Joi schema object
  } else if (value.$_root) {
    // TODO: Identify the schema
    return "<JoiSchema>"
  } else if (value.isGarden) {
    return "<Garden>"
  } else if (isArray(value)) {
    _parents.add(value)
    const out = value.map((v) => sanitizeValue(v, _parents))
    _parents.delete(value)
    return out
  } else if (isPlainObject(value)) {
    _parents.add(value)
    const out = mapValues(value, (v) => sanitizeValue(v, _parents))
    _parents.delete(value)
    return out
  } else if (!isPrimitive(value) && value.constructor) {
    // Looks to be a class instance
    if (value.toSanitizedValue) {
      // Special allowance for internal objects
      return value.toSanitizedValue()
    } else {
      // Any other class. Convert to plain object and sanitize attributes.
      _parents.add(value)
      const out = mapValues({ ...value }, (v) => sanitizeValue(v, _parents))
      _parents.delete(value)
      return out
    }
  } else {
    return value
  }
}

// Recursively filters out internal fields, including keys starting with _ and some specific fields found on Modules.
export function withoutInternalFields(object: any): any {
  return deepFilter(object, (_val, key: string | number) => {
    if (typeof key === "string") {
      return (
        !key.startsWith("_") &&
        // FIXME: this a little hacky and should be removable in 0.14 at the latest.
        // The buildDependencies map on Module objects explodes outputs, as well as the dependencyVersions field on
        // version objects.
        key !== "dependencyVersions" &&
        key !== "dependencyResults" &&
        key !== "buildDependencies"
      )
    }
    return true
  })
}

export function formatGardenErrorWithDetail(error: GardenError) {
  const { detail, message, stack } = error
  let out = stack || message || ""

  // We sanitize and recursively filter out internal fields (i.e. having names starting with _).
  const filteredDetail = withoutInternalFields(sanitizeValue(detail))

  if (!isEmpty(filteredDetail)) {
    try {
      const yamlDetail = safeDumpYaml(filteredDetail, { skipInvalid: true, noRefs: true })
      out += `\n\nError Details:\n\n${yamlDetail}`
    } catch (err) {
      out += `\n\nUnable to render error details:\n${err.message}`
    }
  }
  return out
}

interface DividerOpts {
  width?: number
  char?: string
  titlePadding?: number
  color?: Chalk
  title?: string
  padding?: number
}

const getSideDividerWidth = (width: number, titleWidth: number) => (width - titleWidth) / 2
const getNumberOfCharsPerWidth = (char: string, width: number) => width / stringWidth(char)

// Adapted from https://github.com/JureSotosek/ink-divider
export function renderDivider({
  width = 80,
  char = "─",
  titlePadding = 1,
  color,
  title,
  padding = 0,
}: DividerOpts = {}) {
  const pad = " "

  if (!color) {
    color = chalk.white
  }

  const titleString = title ? `${pad.repeat(titlePadding) + title + pad.repeat(titlePadding)}` : ""
  const titleWidth = stringWidth(titleString)

  const dividerWidth = getSideDividerWidth(width, titleWidth)
  const numberOfCharsPerSide = getNumberOfCharsPerWidth(char, dividerWidth)
  const dividerSideString = color(char.repeat(numberOfCharsPerSide))

  const paddingString = pad.repeat(padding)

  return paddingString + dividerSideString + titleString + dividerSideString + paddingString
}

export function renderMessageWithDivider(prefix: string, msg: string, isError: boolean, color?: Chalk) {
  // Allow overwriting color as an escape hatch. Otherwise defaults to white or red in case of errors.
  const msgColor = color || (isError ? chalk.red : chalk.white)
  return dedent`
  \n${msgColor.bold(prefix)}
  ${msgColor.bold(renderDivider())}
  ${hasAnsi(msg) ? msg : msgColor(msg)}
  ${msgColor.bold(renderDivider())}
  `
}
