// TODO: make log level configurable
import * as logSymbols from "log-symbols"
import * as logUpdate from "log-update"
import * as nodeEmoji from "node-emoji"
import { curryRight, flow, padEnd } from "lodash"
import chalk from "chalk"
import hasAnsi = require("has-ansi")
const elegantSpinner = require("elegant-spinner")

const INTERVAL_DELAY = 100

export enum LogLevels {
  error = 0,
  warn = 1,
  info = 2,
  verbose = 3,
  debug = 4,
  silly = 5,
}

let loggerInstance: Logger
let defaultLogLevel = LogLevels.verbose

// Defines entry style and format
export enum EntryStyle {
  activity = "activity",
  error = "error",
  info = "info",
  warn = "warn",
}

// Icon to show when activity is done
export enum LogSymbolType {
  error = "error",
  info = "info",
  success = "success",
  warn = "warn",
  empty = "empty",
}

enum EntryStatus {
  ACTIVE = "active",
  DONE = "done",
  ERROR = "error",
  SUCCESS = "success",
  WARN = "warn",
}

type EmojiName = keyof typeof nodeEmoji.emoji

interface LogOpts {
  msg?: string | string[]
  section?: string
  emoji?: EmojiName
  symbol?: LogSymbolType
  entryStyle?: EntryStyle
  append?: boolean
}

interface HeaderOpts {
  emoji: string
  command: string
}

// Style helpers
const sectionPrefixWidth = 18
const truncate = (s: string) => s.length > sectionPrefixWidth
  ? `${s.substring(0, sectionPrefixWidth - 3)}...`
  : s
const sectionStyle = (s: string) => chalk.cyan.italic(padEnd(truncate(s), sectionPrefixWidth))
const msgStyle = (s: string) => hasAnsi(s) ? s : chalk.gray(s)
const spinnerStyle = chalk.cyan

// Formatter functions
function renderEntryStyle(style?: EntryStyle): string {
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

function renderEmoji(emoji?: any): string {
  if (emoji && nodeEmoji.hasEmoji(emoji)) {
    return `${nodeEmoji.get(emoji)} `
  }
  return ""
}

function renderSymbol(symbol?: LogSymbolType): string {
  if (symbol === LogSymbolType.empty) {
    return " "
  }
  return symbol ? `${logSymbols[symbol]} ` : ""
}

function renderMsg(msg?: string | string[]): string {
  if (msg && msg instanceof Array) {
    return msgStyle(msg.join(" → "))
  }
  return msg ? msgStyle(msg) : ""
}

function renderSection(section?: string): string {
  return section ? `${sectionStyle(section)} → ` : ""
}

function insertVal(out: string[], idx: number, renderFn: Function, renderArgs: any[]): string[] {
  out[idx] = renderFn(...renderArgs)
  return out
}

// Helper function to create a chain of renderers that each receives the
// updated output array along with the provided parameters
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

function format(renderers: any[][]) {
  const initOutput = []
  return applyRenderers(renderers)(initOutput).join("")
}

function formatForConsole(opts: LogOpts): string {
  const renderers = [
    [renderSymbol, [opts.symbol]],
    [renderEntryStyle, [opts.entryStyle]],
    [renderSection, [opts.section]],
    [renderEmoji, [opts.emoji]],
    [renderMsg, [opts.msg]],
  ]
  return format(renderers)
}

function renderHeader(opts: HeaderOpts) {
  const { emoji, command } = opts
  return `${chalk.bold.magenta(command)} ${nodeEmoji.get(emoji)}\n`
}

export class Logger {
  private entries: LogEntry[]
  private level: LogLevels
  private intervalID: any // TODO
  private startTime: number

  constructor(level: LogLevels) {
    this.startTime = Date.now()
    this.level = level
    this.entries = []
    this.startTime = Date.now()
    this.intervalID = null
  }

  private createLogEntry(level, opts: LogOpts): LogEntry {
    const entry = new LogEntry(level, opts, this)
    this.entries.push(entry)
    return entry
  }

  private addEntryAndRender(level, opts: LogOpts): LogEntry {
    const entry = this.createLogEntry(level, opts)
    if (opts.entryStyle === EntryStyle.activity) {
      this.startLoop()
    }
    this.render()
    return entry
  }

  private startLoop(): void {
    if (!this.intervalID) {
      this.intervalID = setInterval(this.render.bind(this), INTERVAL_DELAY)
    }
  }

  private stopLoop(): void {
    if (this.intervalID) {
      clearInterval(this.intervalID)
      this.intervalID = null
    }
  }

  // Has a side effect in that it stops the rendering loop if no
  // active entries found while building output.
  render(): void {
    let hasActiveEntries = false
    const out = this.entries.reduce((acc: string[], e: LogEntry) => {
      if (e.getStatus() === EntryStatus.ACTIVE) {
        hasActiveEntries = true
      }
      if (this.level >= e.getLevel()) {
        acc.push(e.render())
      }
      return acc
    }, [])
    if (!hasActiveEntries) {
      this.stopLoop()
    }
    logUpdate(out.join("\n"))
  }

  silly(opts: LogOpts): LogEntry {
    return this.addEntryAndRender(LogLevels.silly, opts)
  }

  debug(opts: LogOpts): LogEntry {
    return this.addEntryAndRender(LogLevels.debug, opts)
  }

  verbose(opts: LogOpts): LogEntry {
    return this.addEntryAndRender(LogLevels.verbose, opts)
  }

  info(opts: LogOpts): LogEntry {
    return this.addEntryAndRender(LogLevels.info, opts)
  }

  warn(opts: LogOpts): LogEntry {
    return this.addEntryAndRender(LogLevels.warn, { ...opts, entryStyle: EntryStyle.warn })
  }

  error(opts: LogOpts): LogEntry {
    return this.addEntryAndRender(LogLevels.error, { ...opts, entryStyle: EntryStyle.error })
  }

  header(opts: HeaderOpts): LogEntry {
    return this.addEntryAndRender(LogLevels.verbose, { msg: renderHeader(opts) })
  }

  persist() {
    this.entries.map(e => e.stop())
    this.stopLoop()
    this.entries = []
    logUpdate.done()
  }

  finish() {
    const totalTime = (this.getTotalTime() / 1000).toFixed(2)
    const msg = `\n${nodeEmoji.get("sparkles")}  Finished in ${chalk.bold(totalTime + "s")}\n`
    this.addEntryAndRender(LogLevels.info, { msg })
    this.persist()
  }

  getTotalTime(): number {
    return Date.now() - this.startTime
  }

}

function mergeWithResolvers(objA: any, objB: any, resolvers: any = {}) {
  const returnObj = { ...objA, ...objB }
  return Object.keys(resolvers).reduce((acc, key) => {
    acc[key] = resolvers[key](objA, objB)
    return acc
  }, returnObj)
}

type LogOptsResolvers = { [K in keyof LogOpts]?: Function }

function mergeLogOpts(prevOpts: LogOpts, nextOpts: LogOpts, resolvers: LogOptsResolvers) {
  return mergeWithResolvers(prevOpts, nextOpts, resolvers)
}

export class LogEntry {
  private formattedMsg: string
  private opts: LogOpts
  private logger: Logger
  private frame: any // TODO
  private status: EntryStatus
  private level: LogLevels

  constructor(level: LogLevels, opts: LogOpts, logger: Logger) {
    this.formattedMsg = formatForConsole(opts)
    this.opts = opts
    this.logger = logger
    this.level = level
    if (this.opts.entryStyle === EntryStyle.activity) {
      this.frame = elegantSpinner()
      this.status = EntryStatus.ACTIVE
    }
  }

  private setState(opts: LogOpts, status: EntryStatus): void {
    const resolveMsg = (prevOpts, nextOpts) => {
      const { msg: prevMsg } = prevOpts
      const { append, msg: nextMsg } = nextOpts
      if (nextMsg && append) {
        let msgArr = prevMsg instanceof Array ? prevMsg : [prevMsg]
        msgArr.push(nextMsg)
        return msgArr
      } else if (nextOpts.hasOwnProperty("msg")) {
        return nextMsg
      } else {
        return prevMsg
      }
    }

    // Hack to preserve section alignment if symbols or spinners disappear
    const hadSymbolOrSpinner = this.opts.symbol || this.status === EntryStatus.ACTIVE
    const hasSymbolOrSpinner = opts.symbol || status === EntryStatus.ACTIVE
    if (this.opts.section && hadSymbolOrSpinner && !hasSymbolOrSpinner) {
      opts.symbol = LogSymbolType.empty
    }

    this.opts = mergeLogOpts(this.opts, opts, {
      msg: resolveMsg,
    })
    this.formattedMsg = formatForConsole(this.opts)
    this.status = status
  }

  private setStateAndRender(opts: LogOpts, status: EntryStatus): void {
    this.setState(opts, status)
    this.logger.render()
  }

  stop() {
    // Stop gracefully if still in active state (e.g. because of a crash)
    if (this.status === EntryStatus.ACTIVE) {
      this.setState({ symbol: LogSymbolType.empty }, EntryStatus.DONE)
    }
  }

  render(): string {
    if (this.status === EntryStatus.ACTIVE) {
      return `${spinnerStyle(this.frame())} ${this.formattedMsg}`
    }
    return this.formattedMsg
  }

  getLevel(): LogLevels {
    return this.level
  }

  getStatus(): EntryStatus {
    return this.status
  }

  // We need to persist all previous entries to be able to print the inspection results.
  inspect() {
    this.logger.persist()
    console.log(JSON.stringify({
      ...this.opts,
      level: this.level,
    }))
  }

  // Preserves status
  update(opts: LogOpts = {}): void {
    this.setStateAndRender(opts, this.status)
  }

  done(opts: LogOpts = {}): void {
    this.setStateAndRender(opts, EntryStatus.DONE)
  }

  success(opts: LogOpts = {}): void {
    this.setStateAndRender({ ...opts, symbol: LogSymbolType.success }, EntryStatus.SUCCESS)
  }

  error(opts: LogOpts = {}): void {
    this.setStateAndRender({ ...opts, symbol: LogSymbolType.error }, EntryStatus.ERROR)
  }

  warn(opts: LogOpts = {}): void {
    this.setStateAndRender({ ...opts, symbol: LogSymbolType.warn }, EntryStatus.WARN)
  }

}

export function getLogger(level?: LogLevels) {
  if (!loggerInstance) {
    loggerInstance = new Logger(level || defaultLogLevel)
  }

  return loggerInstance
}

export function setDefaultLogLevel(level: LogLevels) {
  defaultLogLevel = level
}

export function logException(error: Error) {
  console.error((error.stack && chalk.red(error.stack)) || (chalk.red(error.toString())))
}
