/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import hasAnsi from "has-ansi"
import dedent from "dedent"
import stringWidth from "string-width"
import { DEFAULT_BROWSER_DIVIDER_WIDTH } from "../constants.js"
import { styles } from "./styles.js"
import type { ChalkInstance } from "chalk"

// Add platforms/terminals?
export function envSupportsEmoji() {
  return (
    process.platform === "darwin" || process.env.TERM_PROGRAM === "Hyper" || process.env.TERM_PROGRAM === "HyperTerm"
  )
}

let _overrideTerminalWidth: number | undefined

export function overrideTerminalWidth(width: number | undefined) {
  _overrideTerminalWidth = width
}

export function getTerminalWidth(stream: NodeJS.WriteStream = process.stdout) {
  // Used for unit tests
  if (_overrideTerminalWidth) {
    return _overrideTerminalWidth
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
  log.info(styles.command(command) + " " + printEmoji(emoji, log))
  log.info("") // Print new line after header
}

export function printFooter(log: any) {
  log.info("") // Print new line before footer
  return log.info(styles.success(`Done! ${printEmoji("✔️", log)}`))
}

export function printWarningMessage(log: any, text: string) {
  return log.warn(styles.bold(text))
}

interface DividerOpts {
  width?: number
  char?: string
  titlePadding?: number
  color?: ChalkInstance
  title?: string
  padding?: number
}

const getSideDividerWidth = (width: number, titleWidth: number) => Math.max((width - titleWidth) / 2, 1)
const getNumberOfCharsPerWidth = (char: string, width: number) => width / stringWidth(char)

// Adapted from https://github.com/JureSotosek/ink-divider
export function renderDivider({
  width = undefined,
  char = "─",
  titlePadding = 1,
  color,
  title,
  padding = 0,
}: DividerOpts = {}) {
  const pad = " "
  if (!width) {
    width = getTermWidth()
  }

  if (!color) {
    color = styles.accent
  }

  const titleString = title ? `${pad.repeat(titlePadding) + title + pad.repeat(titlePadding)}` : ""
  const titleWidth = stringWidth(titleString)

  const dividerWidth = getSideDividerWidth(width, titleWidth)
  const numberOfCharsPerSide = getNumberOfCharsPerWidth(char, dividerWidth)
  const dividerSideString = color(char.repeat(numberOfCharsPerSide))

  const paddingString = pad.repeat(padding)

  return paddingString + dividerSideString + titleString + dividerSideString + paddingString
}

export const getTermWidth = () => {
  // TODO: accept stdout as param
  return process.stdout?.columns || 100
}

export function renderDuration(duration: number): string {
  return `(took ${duration} sec)`
}

function makeMessageWithDivider({ prefix, msg, divider }: { prefix: string; msg: string; divider: string }) {
  return dedent`
  ${prefix}\n
  ${divider}
  ${msg}
  ${divider}
  `
}

/**
 * Render a given log message with a divider at the start and end of the message.
 * Returns a 'msg' string for printing the message to the terminal and a 'rawMsg'
 * string which is used for logs displayed in the browser.
 */
export function renderMessageWithDivider({
  prefix,
  msg,
  isError,
  color,
}: {
  prefix: string
  msg: string
  isError: boolean
  color?: ChalkInstance
}) {
  // Allow overwriting color as an escape hatch. Otherwise defaults to white or red in case of errors.
  const msgColor = color || (isError ? styles.error : styles.accent)
  const terminalDivider = msgColor.bold(renderDivider())
  const browserDivider = msgColor.bold(renderDivider({ width: DEFAULT_BROWSER_DIVIDER_WIDTH }))
  const dividerOpts = {
    prefix: msgColor.bold(prefix),
    msg: hasAnsi(msg) ? msg : msgColor(msg),
    divider: terminalDivider,
  }
  return {
    msg: makeMessageWithDivider({ ...dividerOpts, divider: terminalDivider }),
    rawMsg: makeMessageWithDivider({ ...dividerOpts, divider: browserDivider }),
  }
}
