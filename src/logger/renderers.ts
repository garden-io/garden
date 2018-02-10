import * as logSymbols from "log-symbols"
import * as nodeEmoji from "node-emoji"
import chalk from "chalk"
import { curryRight, flow, padEnd } from "lodash"
import hasAnsi = require("has-ansi")

import { EntryStyle, HeaderOpts, LogSymbolType } from "./types"

/*** STYLE HELPERS ***/

const sectionPrefixWidth = 18
const truncate = (s: string) => s.length > sectionPrefixWidth
  ? `${s.substring(0, sectionPrefixWidth - 3)}...`
  : s
const sectionStyle = (s: string) => chalk.cyan.italic(padEnd(truncate(s), sectionPrefixWidth))
const msgStyle = (s: string) => hasAnsi(s) ? s : chalk.gray(s)

/*** RENDER HELPERS ***/

function insertVal(out: string[], idx: number, renderFn: Function, renderArgs: any[]): string[] {
  out[idx] = renderFn(...renderArgs)
  return out
}

// Creates a chain of renderers that each receives the updated output array along with the provided parameters
function applyRenderers(renderers: any[][]): Function {
  const curried = renderers.map((p, idx) => {
    const args = [idx, p[0], p[1]]
    // FIXME Currying like this throws "Expected 0-4 arguments, but got 0 or more"
    // Setting (insertVal as any) does not work.
    // @ts-ignore
    return curryRight(insertVal)(...args)
  })
  return flow(curried)
}

/*** RENDERERS ***/

export function renderEntryStyle(style?: EntryStyle): string {
  if (style) {
    return {
      info: chalk.bold.green("Info "),
      warn: chalk.bold.yellow("Warning "),
      error: chalk.bold.red("Error "),
      none: "",
    }[style] || ""
  }
  return ""
}

export function renderEmoji(emoji?: any): string {
  if (emoji && nodeEmoji.hasEmoji(emoji)) {
    return `${nodeEmoji.get(emoji)}  `
  }
  return ""
}

export function renderSymbol(symbol?: LogSymbolType): string {
  if (symbol === LogSymbolType.empty) {
    return " "
  }
  return symbol ? `${logSymbols[symbol]} ` : ""
}

export function renderMsg(msg?: string | string[]): string {
  if (msg && msg instanceof Array) {
    return msg.map(msgStyle).join(chalk.gray(" → "))
  }
  return msg ? msgStyle(msg) : ""
}

export function renderSection(section?: string): string {
  return section ? `${sectionStyle(section)} → ` : ""
}

// Accepts a list of tuples containing a render functions and it's args: [renderFn, [arguments]]
export function format(renderers: any[][]): string {
  const initOutput = []
  return applyRenderers(renderers)(initOutput).join("")
}

export function renderHeader(opts: HeaderOpts) {
  const { emoji, command } = opts
  return `${chalk.bold.magenta(command)} ${emoji ? nodeEmoji.get(emoji) : ""}\n`
}
