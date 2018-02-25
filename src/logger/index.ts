// TODO: make log level configurable
import * as logUpdate from "log-update"
import * as nodeEmoji from "node-emoji"
import chalk from "chalk"
import { flatten } from "lodash"

const elegantSpinner = require("elegant-spinner")

import {
  format,
  renderDuration,
  renderEmoji,
  renderHeader,
  renderMsg,
  renderSection,
  renderSymbol,
} from "./renderers"

import {
  EntryStatus,
  EntryStyle,
  HeaderOpts,
  LoggerType,
  LogLevel,
  LogOpts,
  LogSymbolType,
} from "./types"

import {
  duration,
  getNodeListFromTree,
  mergeLogOpts,
} from "./util"

const INTERVAL_DELAY = 100
const spinnerStyle = chalk.cyan

let loggerInstance: Logger
let defaultLogLevel = LogLevel.verbose
let defaultLoggerType = LoggerType.fancy

interface LogWriteFn {
  (logOpts: LogOpts, parent?: LogEntry): LogEntry
}

interface FinishOpts {
  showDuration?: boolean
}

export abstract class Logger {
  public entries: LogEntry[]
  public level: LogLevel
  public startTime: number

  constructor(level: LogLevel) {
    this.startTime = Date.now()
    this.level = level
    this.entries = []
  }

  abstract render(): string | string[] | null
  abstract write(): void
  abstract createLogEntry(level, opts: LogOpts, depth: number): LogEntry

  protected addEntryAndRender(level, opts: LogOpts, parent?: LogEntry): LogEntry {
    const depth = parent ? parent.depth + 1 : 0
    const entry = this.createLogEntry(level, opts, depth)
    if (parent) {
      parent.pushChild(entry)
    } else {
      this.entries.push(entry)
    }
    this.write()
    return entry
  }

  silly: LogWriteFn = (opts: LogOpts, parent?: LogEntry): LogEntry => {
    return this.addEntryAndRender(LogLevel.silly, opts, parent)
  }

  debug: LogWriteFn = (opts: LogOpts, parent?: LogEntry): LogEntry => {
    return this.addEntryAndRender(LogLevel.debug, opts, parent)
  }

  verbose: LogWriteFn = (opts: LogOpts, parent?: LogEntry): LogEntry => {
    return this.addEntryAndRender(LogLevel.verbose, opts, parent)
  }

  info: LogWriteFn = (opts: LogOpts, parent?: LogEntry): LogEntry => {
    return this.addEntryAndRender(LogLevel.info, opts, parent)
  }

  warn: LogWriteFn = (opts: LogOpts, parent?: LogEntry): LogEntry => {
    return this.addEntryAndRender(LogLevel.warn, opts, parent)
  }

  error: LogWriteFn = (opts: LogOpts, parent?: LogEntry): LogEntry => {
    return this.addEntryAndRender(LogLevel.error, opts, parent)
  }

  header(opts: HeaderOpts): LogEntry {
    return this.addEntryAndRender(LogLevel.verbose, { msg: renderHeader(opts) })
  }

  finish(opts?: FinishOpts): LogEntry {
    const msg = format([
      [() => `\n${nodeEmoji.get("sparkles")}  Finished`, []],
      [() => opts && opts.showDuration ? ` in ${chalk.bold(duration(this.startTime) + "s")}` : "!", []],
      [() => "\n", []],
    ])
    return this.info({ msg })
  }

}

export class BasicLogger extends Logger {

  createLogEntry(level, opts: LogOpts, depth: number): LogEntry {
    return new BasicLogEntry(level, opts, this, depth)
  }

  write(): void {
    const out = this.render()
    if (out !== null) { console.log(out) }
  }

  render(): string | null {
    const entry = this.entries[this.entries.length - 1]
    if (this.level >= entry.level) {
      return entry.render()
    }
    return null
  }

}

export class FancyLogger extends Logger {
  private intervalID: NodeJS.Timer | null

  constructor(level: LogLevel) {
    super(level)
    this.intervalID = null
  }

  protected startLoop(): void {
    if (!this.intervalID) {
      this.intervalID = setInterval(this.write.bind(this), INTERVAL_DELAY)
    }
  }

  protected stopLoop(): void {
    if (this.intervalID) {
      clearInterval(this.intervalID)
      this.intervalID = null
    }
  }

  createLogEntry(level, opts: LogOpts, depth: number): LogEntry {
    return new FancyLogEntry(level, opts, this, depth)
  }

  protected addEntryAndRender(level: LogLevel, opts: LogOpts, parent?: LogEntry): LogEntry {
    if (opts.entryStyle === EntryStyle.activity) {
      this.startLoop()
    }
    return super.addEntryAndRender(level, opts, parent)
  }

  write(): void {
    const out = this.render()
    if (out) {
      logUpdate(out.join("\n"))
    }
  }

  // Has a side effect in that it stops the rendering loop if no
  // active entries found while building output.
  render(): string[] | null {
    let hasActiveEntries = false
    const nodes = flatten(this.entries.map(e => getNodeListFromTree(e)))
    const out = nodes.reduce((acc: string[], e: LogEntry) => {
      if (e.getStatus() === EntryStatus.ACTIVE) {
        hasActiveEntries = true
      }
      if (this.level >= e.level) {
        acc.push(e.render())
      }
      return acc
    }, [])
    if (!hasActiveEntries) {
      this.stopLoop()
    }
    if (out.length) {
      return out
    }
    return null
  }

  finish() {
    super.finish()
    this.persist()
  }

  persist() {
    this.entries.map(e => e.stop())
    this.stopLoop()
    logUpdate.done()
  }

}

type LoggerWriteMethods = { [key: string]: LogWriteFn }

export abstract class LogEntry {
  protected formattedMsg: string
  protected opts: LogOpts
  protected logger: Logger
  protected status: EntryStatus

  public startTime: number
  public level: LogLevel
  public depth: number
  public children: LogEntry[]
  public nest: LoggerWriteMethods = this.exposeLoggerWriteMethods()

  constructor(level: LogLevel, opts: LogOpts, logger: Logger, depth?: number) {
    this.startTime = Date.now()
    this.depth = depth || 0
    this.opts = opts
    this.logger = logger
    this.children = []
    this.level = level
    if (opts.entryStyle === EntryStyle.activity) {
      this.status = EntryStatus.ACTIVE
    }
    this.formattedMsg = this.format()
  }

  abstract render(): string

  // Expose the Logger write methods on a LogEntry instance to allow for an API like logEntry.nest.info(logOpts)
  // Feels a bit hacky though
  private exposeLoggerWriteMethods() {
    return ["error", "warn", "info", "verbose", "debug", "silly"].reduce((acc, key) => {
      const fn: LogWriteFn = (logOpts: LogOpts): LogEntry => this.logger[key].bind(this.logger)(logOpts, this)
      acc[key] = fn
      return acc
    }, {})
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
    this.formattedMsg = this.format()
    this.status = status
  }

  private setStateAndRender(opts: LogOpts, status: EntryStatus): LogEntry {
    this.setState(opts, status)
    this.logger.render()
    return this
  }

  protected format(): string {
    let renderers
    if (this.depth > 0) {
      // Skip section on child entries. We might want to change this a bit
      renderers = [
        [renderSymbol, [this.opts.symbol]],
        [renderEmoji, [this.opts.emoji]],
        [renderMsg, [this.opts.msg]],
      ]
    } else {
      renderers = [
        [renderSymbol, [this.opts.symbol]],
        [renderEntryStyle, [this.opts.entryStyle]],
        [renderSection, [this.opts.section]],
        [renderEmoji, [this.opts.emoji]],
        [renderMsg, [this.opts.msg]],
      ]
    }
    return format(renderers)
  }

  pushChild(child: LogEntry): void {
    this.children.push(child)
  }

  stop() {
    // Stop gracefully if still in active state
    if (this.status === EntryStatus.ACTIVE) {
      this.setState({ symbol: LogSymbolType.empty }, EntryStatus.DONE)
    }
  }

  getStatus(): EntryStatus {
    return this.status
  }

  // FIXME Doesn't work with FancyLogger due to updates
  inspect() {
    console.log(JSON.stringify({
      ...this.opts,
      level: this.level,
      children: this.children,
    }))
  }

  // Preserves status
  update(opts: LogOpts = {}): LogEntry {
    return this.setStateAndRender(opts, this.status)
  }

  done(opts: LogOpts = {}): LogEntry {
    return this.setStateAndRender(opts, EntryStatus.DONE)
  }

  success(opts: LogOpts = {}): LogEntry {
    return this.setStateAndRender({ ...opts, symbol: LogSymbolType.success }, EntryStatus.SUCCESS)
  }

  error(opts: LogOpts = {}): LogEntry {
    return this.setStateAndRender({ ...opts, symbol: LogSymbolType.error }, EntryStatus.ERROR)
  }

  warn(opts: LogOpts = {}): LogEntry {
    return this.setStateAndRender({ ...opts, symbol: LogSymbolType.warn }, EntryStatus.WARN)
  }

}

const padByDepth = (n: number): string => {
  let pad = ""
  for (let i = 0; i < n; i++) {
    pad += "    "
  }
  return pad
}

class FancyLogEntry extends LogEntry {
  private frame: Function

  constructor(level: LogLevel, opts: LogOpts, logger: Logger, depth?: number) {
    super(level, opts, logger, depth)
    if (opts.entryStyle === EntryStyle.activity) {
      this.frame = elegantSpinner()
    }
  }

  // NOTE: The spinner updates on every render call but we don't want to reformat the entire string
  // on each render so we handle the spinner (and padding because it appears before the spinner) here.
  // Needs a better solution since it makes the format less declarative.
  render(): string {
    const pad = padByDepth(this.depth)
    if (this.status === EntryStatus.ACTIVE) {
      return `${pad}${spinnerStyle(this.frame())} ${this.formattedMsg}`
    }
    return `${pad}${this.formattedMsg}`
  }

}

class BasicLogEntry extends LogEntry {

  render(): string {
    return `${padByDepth(this.depth)}${this.formattedMsg}`
  }

}

interface GetLoggerParams {
  level?: LogLevel
  loggerType?: LoggerType
}

export function getLogger(params: GetLoggerParams = {}) {
  if (loggerInstance) {
    return loggerInstance
  }

  const { level = defaultLogLevel, loggerType = defaultLoggerType } = params
  if (loggerType === LoggerType.fancy) {
    loggerInstance = new FancyLogger(level)
  } else {
    loggerInstance = new BasicLogger(level)
  }
  return loggerInstance
}

export function setDefaultLogLevel(level: LogLevel) {
  defaultLogLevel = level
}

export function setDefaultLoggerType(loggerType: LoggerType) {
  defaultLoggerType = loggerType
}

export function logException(error: Error) {
  console.error((error.stack && chalk.red(error.stack)) || (chalk.red(error.toString())))
}
