// TODO: make log level configurable
import * as logSymbols from "log-symbols"
import * as logUpdate from "log-update"
import * as nodeEmoji from "node-emoji"
import chalk from "chalk"
import hasAnsi = require("has-ansi")
const elegantSpinner = require("elegant-spinner")

const DEFAULT_LOG_LEVEL = "verbose"
const INTERVAL_DELAY = 100

let loggerInstance: Logger

enum LogLevels {
  error = 0,
  warn = 1,
  info = 2,
  verbose = 3,
  debug = 4,
  silly = 5,
}

// Defines entry style and format
export enum EntryStyles {
  activity = "activity",
  error = "error",
  info = "info",
  warn = "warn",
}

// Icon to show when activity is done
export enum LogSymbolTypes {
  error = "error",
  info = "info",
  success = "success",
  warning = "warning",
}

enum EntryStates {
  ACTIVE = "active",
  DONE = "done",
  ERROR = "error",
  SUCCESS = "success",
  WARN = "warn",
}

type EmojiName = keyof typeof nodeEmoji.emoji

interface LogOpts {
  msg: string
  section?: string
  emoji?: EmojiName
  symbol?: LogSymbolTypes
  entryStyle?: EntryStyles
}

interface HeaderOpts {
  emoji: string
  command: string
}

interface UpdateOpts {
  msg?: string
  section?: string
  emoji?: EmojiName
  replace?: boolean
}

// Formatting
const sectionPrefixWidth = 18
const truncate = (s: string) => s.length > sectionPrefixWidth
  ? `${s.substring(0, sectionPrefixWidth - 3)}...`
  : s
const sectionStyle = (s: string) => (
  chalk.cyan.italic(truncate(s))
)
const msgStyle = (s: string) => (
  hasAnsi(s) ? s : chalk.gray(s)
)
const spinnerStyle = chalk.cyan

function format(opts: LogOpts) {
  const { emoji, section, symbol, msg, entryStyle } = opts
  let out = ""
  let pre = ""
  if (entryStyle) {
    pre = {
      info: chalk.bold.green("Info "),
      warn: chalk.bold.yellow("Warning "),
      error: chalk.bold.red("Error "),
      none: "",
    }[entryStyle] || ""
  }
  out += pre
  out += symbol ? `${logSymbols[symbol]} ` : ""
  out += emoji && nodeEmoji.hasEmoji(emoji) ? `${nodeEmoji.get(emoji)} ` : ""
  out += section ? `${sectionStyle(section)} → ` : ""
  out += msgStyle(msg)
  return out
}

function update(symbolType: string = "") {
  return function(opts: UpdateOpts, msg: string) {
    const text = opts.replace && opts.msg
      ? opts.msg
      : `${msg}${opts.msg ? " → " + opts.msg : ""}`
    if (symbolType) {
      return `${logSymbols[symbolType]} ${text}`
    }
    return text
  }
}

const updateSimple = update()
const updateError = update(LogSymbolTypes.error)
const updateWarn = update(LogSymbolTypes.warning)
const updateSuccess = update(LogSymbolTypes.success)

function printHeader(opts: HeaderOpts) {
  const { emoji, command } = opts
  // tslint:disable:max-line-length
  const header = `
${nodeEmoji.get(emoji)}  ${chalk.bold.magenta(command.toUpperCase())}  ${nodeEmoji.get(emoji)}
  `
  // tslint:enablee:max-line-length
  return header
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

  private log(level, opts: LogOpts): LogEntry {
    const msg = format(opts)
    const entry = new LogEntry(msg, this, level, opts.entryStyle)
    this.entries.push(entry)
    if (opts.entryStyle === EntryStyles.activity) {
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
      if (e.getState() === EntryStates.ACTIVE) {
        hasActiveEntries = true
      }
      if (this.level >= e.getLevel()) {
        acc.push(e.getMsg())
      }
      return acc
    }, [])
    if (!hasActiveEntries) {
      this.stopLoop()
    }
    logUpdate(out.join("\n"))
  }

  silly(opts: LogOpts): LogEntry {
    return this.log(LogLevels.silly, opts)
  }

  debug(opts: LogOpts): LogEntry {
    return this.log(LogLevels.debug, opts)
  }

  verbose(opts: LogOpts): LogEntry {
    return this.log(LogLevels.verbose, opts)
  }

  info(opts: LogOpts): LogEntry {
    return this.log(LogLevels.info, opts)
  }

  warn(opts: LogOpts): LogEntry {
    return this.log(LogLevels.warn, { ...opts, entryStyle: EntryStyles.warn })
  }

  error(opts: LogOpts): LogEntry {
    return this.log(LogLevels.error, { ...opts, entryStyle: EntryStyles.error })
  }

  header(opts: HeaderOpts): LogEntry {
    return this.log(LogLevels.verbose, { msg: printHeader(opts) })
  }

  finish() {
    const totalTime = (this.getTotalTime() / 1000).toFixed(2)
    const msg = `\n${nodeEmoji.get("sparkles")}  Finished in ${chalk.bold(totalTime + "s")}\n`
    this.entries.map(e => e.stop())
    this.stopLoop()
    this.log("info", { msg })
    logUpdate.done()
  }

  getTotalTime(): number {
    return Date.now() - this.startTime
  }

}

export class LogEntry {
  private msg: string
  private logger: Logger
  private frame: any // TODO
  private state: EntryStates
  private level: LogLevels
  private entryStyle?: EntryStyles

  constructor(msg: string, logger: Logger, level: LogLevels, entryStyle?: EntryStyles) {
    this.msg = msg
    this.logger = logger
    this.entryStyle = entryStyle
    this.level = level
    if (this.entryStyle === EntryStyles.activity) {
      this.frame = elegantSpinner()
      this.state = EntryStates.ACTIVE
    }
  }

  private setState(msg: string, state: EntryStates): void {
    this.msg = msg
    this.state = state
    this.logger.render()
  }

  stop() {
    if (this.state === EntryStates.ACTIVE) {
      this.state = EntryStates.DONE
    }
  }

  getMsg(): string {
    if (this.state === EntryStates.ACTIVE) {
      return `${spinnerStyle(this.frame())} ${this.msg}`
    }
    return this.msg
  }

  getLevel(): LogLevels {
    return this.level
  }

  getState(): EntryStates {
    return this.state
  }

  // Preserves state
  update(opts: UpdateOpts = {}): void {
    this.setState(updateSimple(opts, this.msg), this.state)
  }

  done(opts: UpdateOpts = {}): void {
    this.setState(updateSimple(opts, this.msg), EntryStates.DONE)
  }

  success(opts: UpdateOpts = {}): void {
    this.setState(updateSuccess(opts, this.msg), EntryStates.SUCCESS)
  }

  error(opts: UpdateOpts = {}): void {
    this.setState(updateError(opts, this.msg), EntryStates.ERROR)
  }

  warn(opts: UpdateOpts = {}): void {
    this.setState(updateWarn(opts, this.msg), EntryStates.WARN)
  }

}

export function getLogger(level = LogLevels[DEFAULT_LOG_LEVEL]) {
  if (!loggerInstance) {
    loggerInstance = new Logger(level)
  }

  return loggerInstance
}

export function logException(error: Error) {
  console.error((error.stack && chalk.red(error.stack)) || (chalk.red(error.toString())))
}
