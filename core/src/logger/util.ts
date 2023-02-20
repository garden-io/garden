/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk, { Chalk } from "chalk"
import { Log } from "./log-entry"
import hasAnsi from "has-ansi"
import dedent from "dedent"
import stringWidth from "string-width"

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

export function findParentLogContext(log: Log, predicate: ProcessLog<Log>): Log | null {
  return predicate(log) ? log : log.parent ? findParentLogContext(log.parent, predicate) : null
}

/**
 * Returns the entry's section or first parent section it finds.
 */
export function findSection(entry: any): string | null {
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
export function printEmoji(emoji: string, log: any) {
  if (log.root.useEmoji) {
    return `${emoji} `
  }
  return ""
}

export function printHeader(log: any, command: string, emoji: string): void {
  log.info(chalk.bold.magenta(command) + " " + printEmoji(emoji, log))
  log.info("") // Print new line after header
}

export function printFooter(log: any) {
  log.info("") // Print new line before footer
  return log.info(chalk.bold.magenta("Done!") + " " + printEmoji("✔️", log))
}

export function printWarningMessage(log: any, text: string) {
  return log.warn(chalk.bold.yellow(text))
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
