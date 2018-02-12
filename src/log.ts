// TODO: make log level configurable
import * as logSymbols from "log-symbols"
import * as logUpdate from "log-update"
import * as nodeEmoji from "node-emoji"
import { curryRight, flatten, flow, padEnd } from "lodash"
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

interface LogWriteFn {
  (logOpts: LogOpts, parent?: LogEntry): LogEntry
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

// Accepts a list of tuples containing a render functions and it's args: [renderFn, [arguments]]
function format(renderers: any[][]): string {
  const initOutput = []
  return applyRenderers(renderers)(initOutput).join("")
}

function renderHeader(opts: HeaderOpts) {
  const { emoji, command } = opts
  return `${chalk.bold.magenta(command)} ${nodeEmoji.get(emoji)}\n`
}

// Tree traversal
interface Node {
  children: any[]
}

function getNodeListFromTree<T extends Node>(node: T): T[] {
  let arr: T[] = []
  arr.push(node)
  if (node.children.length === 0) {
    return arr
  }
  return arr.concat(flatten(node.children.map(child => getNodeListFromTree(child))))
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

  createLogEntry(level, opts: LogOpts, parent?: LogEntry): LogEntry {
    const depth = parent ? parent.depth + 1 : 0
    const entry = new LogEntry(level, opts, this, depth)
    if (parent) {
      parent.pushChild(entry)
    } else {
      this.entries.push(entry)
    }
    return entry
  }

  private addEntryAndRender(level, opts: LogOpts, parent?: LogEntry): LogEntry {
    const entry = this.createLogEntry(level, opts, parent)
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
    const nodes = flatten(this.entries.map(e => getNodeListFromTree(e)))
    const out = nodes.reduce((acc: string[], e: LogEntry) => {
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

  silly: LogWriteFn = (opts: LogOpts, parent?: LogEntry): LogEntry => {
    return this.addEntryAndRender(LogLevels.silly, opts, parent)
  }

  debug: LogWriteFn = (opts: LogOpts, parent?: LogEntry): LogEntry => {
    return this.addEntryAndRender(LogLevels.debug, opts, parent)
  }

  verbose: LogWriteFn = (opts: LogOpts, parent?: LogEntry): LogEntry => {
    return this.addEntryAndRender(LogLevels.verbose, opts, parent)
  }

  info: LogWriteFn = (opts: LogOpts, parent?: LogEntry): LogEntry => {
    return this.addEntryAndRender(LogLevels.info, opts, parent)
  }

  warn: LogWriteFn = (opts: LogOpts, parent?: LogEntry): LogEntry => {
    return this.addEntryAndRender(LogLevels.warn, { ...opts, entryStyle: EntryStyle.warn }, parent)
  }

  error: LogWriteFn = (opts: LogOpts, parent?: LogEntry): LogEntry => {
    return this.addEntryAndRender(LogLevels.error, { ...opts, entryStyle: EntryStyle.error }, parent)
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

type LoggerWriteMethods = { [key: string]: LogWriteFn }

export class LogEntry {
  private formattedMsg: string
  private opts: LogOpts
  private logger: Logger
  private frame: Function
  private status: EntryStatus
  private level: LogLevels

  public depth: number
  public children: LogEntry[]
  public nest: LoggerWriteMethods = this.exposeLoggerWriteMethods()

  constructor(level: LogLevels, opts: LogOpts, logger: Logger, depth?: number) {
    this.depth = depth || 0
    this.opts = opts
    this.logger = logger
    this.children = []
    this.level = level
    if (this.opts.entryStyle === EntryStyle.activity) {
      this.frame = elegantSpinner()
      this.status = EntryStatus.ACTIVE
    }
    this.formattedMsg = this.format()
  }

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

  private setStateAndRender(opts: LogOpts, status: EntryStatus): void {
    this.setState(opts, status)
    this.logger.render()
  }

  private format(): string {
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

  // NOTE: The spinner updates on every render call but we don't want to reformat the entire string
  // on each render so we handle the spinner (and padding because it appears before the spinner) here.
  // Needs a better solution since it makes the format less declarative.
  render(): string {
    let pad = ""
    for (let i = 0; i < this.depth; i++) {
      pad += "    "
    }
    if (this.status === EntryStatus.ACTIVE) {
      return `${pad}${spinnerStyle(this.frame())} ${this.formattedMsg}`
    }
    return `${pad}${this.formattedMsg}`
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
      children: this.children,
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
