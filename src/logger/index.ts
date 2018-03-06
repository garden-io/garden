// TODO: make log level configurable
import * as nodeEmoji from "node-emoji"
import chalk from "chalk"

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
import { BasicConsoleWriter, ConsoleWriter, FancyConsoleWriter } from "./writers"
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
  getChildNodes,
  mergeLogOpts,
} from "./util"

const ROOT_DEPTH = -1
const spinnerStyle = chalk.cyan

let loggerInstance: RootLogNode
let defaultLogLevel = LogLevel.verbose
let defaultLoggerType = LoggerType.fancy

interface FinishOpts {
  showDuration?: boolean
}

interface LogEntryConstructor {
  level: LogLevel
  opts: LogOpts
  depth: number
  root: RootLogNode
}

function createLogEntry(level: LogLevel, opts: LogOpts, parent: LogNode) {
  const { depth, root } = parent
  const { loggerType } = root
  const params = {
    depth: depth + 1,
    root,
    level,
    opts,
  }
  if (loggerType === LoggerType.fancy) {
    return new FancyLogEntry(params)
  }
  return new BasicLogEntry(params)
}

type CreateLogEntry = (logOpts: LogOpts) => LogEntry
type UpdateLogEntry = (logOpts?: LogOpts) => LogEntry

abstract class LogNode {
  public root: RootLogNode
  public startTime: number
  public level: LogLevel
  public depth: number
  public children: LogEntry[]

  constructor(level: LogLevel, depth: number) {
    this.startTime = Date.now()
    this.children = []
    this.depth = depth
    this.level = level
  }

  protected addNode(level: LogLevel, opts: LogOpts): LogEntry {
    const node = createLogEntry(level, opts, this)
    this.children.push(node)
    this.root.onGraphChange(node)
    return node
  }

  public silly: CreateLogEntry = (opts: LogOpts): LogEntry => {
    return this.addNode(LogLevel.silly, opts)
  }

  public debug: CreateLogEntry = (opts: LogOpts): LogEntry => {
    return this.addNode(LogLevel.debug, opts)
  }

  public verbose: CreateLogEntry = (opts: LogOpts): LogEntry => {
    return this.addNode(LogLevel.verbose, opts)
  }

  public info: CreateLogEntry = (opts: LogOpts): LogEntry => {
    return this.addNode(LogLevel.info, opts)
  }

  public warn: CreateLogEntry = (opts: LogOpts): LogEntry => {
    return this.addNode(LogLevel.warn, opts)
  }

  public error: CreateLogEntry = (opts: LogOpts): LogEntry => {
    return this.addNode(LogLevel.error, opts)
  }

}

export abstract class LogEntry extends LogNode {
  protected opts: LogOpts

  public status: EntryStatus
  public root: RootLogNode
  public startTime: number
  public level: LogLevel
  public depth: number
  public children: LogEntry[]

  constructor({ level, opts, depth, root }: LogEntryConstructor) {
    super(level, depth)
    this.root = root
    this.opts = opts
    if (opts.entryStyle === EntryStyle.activity) {
      this.status = EntryStatus.ACTIVE
    }
  }

  abstract render(): string

  protected setOwnState(opts: LogOpts, status: EntryStatus): void {
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
    this.status = status
  }

  protected getFormattedEntry(): string {
    let renderers
    if (this.depth > 0) {
      // Skip section on child entries.
      renderers = [
        [renderSymbol, [this.opts.symbol]],
        [renderEmoji, [this.opts.emoji]],
        [renderMsg, [this.opts.msg]],
        [renderDuration, [this.startTime, this.opts.showDuration]],
      ]
    } else {
      renderers = [
        [renderSymbol, [this.opts.symbol]],
        [renderSection, [this.opts.section]],
        [renderEmoji, [this.opts.emoji]],
        [renderMsg, [this.opts.msg]],
        [renderDuration, [this.startTime, this.opts.showDuration]],
      ]
    }
    return format(renderers)
  }

  originIsNotLogger(): boolean {
    return !!this.opts.originIsNotLogger
  }

  stop() {
    // Stop gracefully if still in active state
    if (this.status === EntryStatus.ACTIVE) {
      this.setOwnState({ symbol: LogSymbolType.empty }, EntryStatus.DONE)
    }
  }

  public inspect() {
    console.log(JSON.stringify({
      ...this.opts,
      level: this.level,
      children: this.children,
    }))
  }

  //  Update node and child nodes
  private deepSetState(opts: LogOpts, status: EntryStatus): void {
    this.setOwnState(opts, status)
    getChildNodes(this).forEach(entry => {
      if (entry.status === EntryStatus.ACTIVE) {
        entry.setOwnState({}, EntryStatus.DONE)
      }
    })
  }

  // Preserves status
  public setState: UpdateLogEntry = (opts: LogOpts = {}): LogEntry => {
    this.deepSetState(opts, this.status)
    this.root.onGraphChange(this)
    return this
  }

  public setDone: UpdateLogEntry = (opts: LogOpts = {}): LogEntry => {
    this.deepSetState(opts, EntryStatus.DONE)
    this.root.onGraphChange(this)
    return this
  }

  public setSuccess: UpdateLogEntry = (opts: LogOpts = {}): LogEntry => {
    this.deepSetState({ ...opts, symbol: LogSymbolType.success }, EntryStatus.SUCCESS)
    this.root.onGraphChange(this)
    return this
  }

  public setError: UpdateLogEntry = (opts: LogOpts = {}): LogEntry => {
    this.deepSetState({ ...opts, symbol: LogSymbolType.error }, EntryStatus.ERROR)
    this.root.onGraphChange(this)
    return this
  }

  public setWarn: UpdateLogEntry = (opts: LogOpts = {}): LogEntry => {
    this.deepSetState({ ...opts, symbol: LogSymbolType.warn }, EntryStatus.WARN)
    this.root.onGraphChange(this)
    return this
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
  private formatted: string
  private frame: Function

  constructor(params: LogEntryConstructor) {
    super(params)
    // Cache string so we don't have to rebuild it on each render
    this.formatted = this.getFormattedEntry()
    if (params.opts.entryStyle === EntryStyle.activity) {
      this.frame = elegantSpinner()
    }
  }

  protected setOwnState(opts: LogOpts, status: EntryStatus): void {
    super.setOwnState(opts, status)
    this.formatted = this.getFormattedEntry()
  }

  // NOTE: The spinner updates on every render call but we don't want to reformat the entire string
  // on each render so we handle the spinner (and padding because it appears before the spinner) here.
  // Needs a better solution since it makes the format less declarative.
  render(): string {
    const pad = padByDepth(this.depth)
    if (this.status === EntryStatus.ACTIVE) {
      return `${pad}${spinnerStyle(this.frame())} ${this.formatted}`
    }
    return `${pad}${this.formatted}`
  }

}

class BasicLogEntry extends LogEntry {

  render(): string {
    return `${padByDepth(this.depth)}${this.getFormattedEntry()}`
  }

}

const WRITERS = {
  [LoggerType.basic]: BasicConsoleWriter,
  [LoggerType.fancy]: FancyConsoleWriter,
}

export class RootLogNode extends LogNode {
  public root: RootLogNode
  public writer?: ConsoleWriter
  public loggerType: LoggerType

  constructor(level, loggerType) {
    super(level, ROOT_DEPTH)
    this.level = level
    this.root = this
    this.loggerType = loggerType
    const WriterClass = WRITERS[this.loggerType]
    if (WriterClass) {
      this.writer = new WriterClass(this.level, this)
    }
  }

  public onGraphChange(entry: LogEntry): void {
    this.writer && this.writer.write(entry)
  }

  public header(opts: HeaderOpts): LogEntry {
    return this.verbose({ msg: renderHeader(opts) })
  }

  public getLogEntries(): LogEntry[] {
    return getChildNodes(<any>this).filter(entry => !entry.originIsNotLogger())
  }

  public finish(opts?: FinishOpts): LogEntry {
    const msg = format([
      [() => `\n${nodeEmoji.get("sparkles")}  Finished`, []],
      [() => opts && opts.showDuration ? ` in ${chalk.bold(duration(this.startTime) + "s")}` : "!", []],
      [() => "\n", []],
    ])
    return this.info({ msg })
  }

  public stop(): void {
    this.getLogEntries().forEach(e => e.stop())
    this.writer && this.writer.stop()
  }

}

export function getLogger(params: { level?: LogLevel, loggerType?: LoggerType } = {}) {
  if (loggerInstance) {
    return loggerInstance
  }

  const { level = defaultLogLevel, loggerType = defaultLoggerType } = params
  loggerInstance = new RootLogNode(level, loggerType)
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
