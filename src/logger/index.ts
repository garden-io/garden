/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as nodeEmoji from "node-emoji"
import chalk from "chalk"

import { Writer, FancyConsoleWriter } from "./writers"
import {
  duration,
  getChildNodes,
  mergeLogOpts,
} from "./util"
import {
  EntryStatus,
  EntryStyle,
  LoggerType,
  LogLevel,
  LogEntryOpts,
  LogSymbolType,
} from "./types"
import { format } from "./renderers"
import { ParameterError } from "../exceptions"

const ROOT_DEPTH = -1
const DEFAULT_CONFIGS: {[key in LoggerType]: LoggerConfig} = {
  [LoggerType.development]: {
    level: LogLevel.verbose,
    writers: [new FancyConsoleWriter()],
  },
  [LoggerType.test]: {
    level: LogLevel.error,
  },
}

export interface LoggerConfig {
  level: LogLevel
  writers?: Writer[]
}

export interface LogEntryConstructor {
  level: LogLevel
  opts: LogEntryOpts
  depth: number
  root: RootLogNode
}

let loggerInstance: RootLogNode
let defaultLoggerType: LoggerType = LoggerType.development
let defaultLoggerConfig: LoggerConfig = DEFAULT_CONFIGS[defaultLoggerType]

function createLogEntry(level: LogLevel, opts: LogEntryOpts, parent: LogNode) {
  const { depth, root } = parent
  const params = {
    depth: depth + 1,
    root,
    level,
    opts,
  }
  return new LogEntry(params)
}

export type CreateLogEntry = (logOpts: LogEntryOpts) => LogEntry
export type UpdateLogEntry = (logOpts?: LogEntryOpts) => LogEntry

export abstract class LogNode {
  public root: RootLogNode
  public timestamp: number
  public level: LogLevel
  public depth: number
  public children: LogEntry[]

  constructor(level: LogLevel, depth: number) {
    this.timestamp = Date.now()
    this.children = []
    this.depth = depth
    this.level = level
  }

  protected addNode(level: LogLevel, opts: LogEntryOpts): LogEntry {
    const node = createLogEntry(level, opts, this)
    this.children.push(node)
    this.root.onGraphChange(node)
    return node
  }

  public silly: CreateLogEntry = (opts: LogEntryOpts): LogEntry => {
    return this.addNode(LogLevel.silly, opts)
  }

  public debug: CreateLogEntry = (opts: LogEntryOpts): LogEntry => {
    return this.addNode(LogLevel.debug, opts)
  }

  public verbose: CreateLogEntry = (opts: LogEntryOpts): LogEntry => {
    return this.addNode(LogLevel.verbose, opts)
  }

  public info: CreateLogEntry = (opts: LogEntryOpts): LogEntry => {
    return this.addNode(LogLevel.info, opts)
  }

  public warn: CreateLogEntry = (opts: LogEntryOpts): LogEntry => {
    return this.addNode(LogLevel.warn, opts)
  }

  public error: CreateLogEntry = (opts: LogEntryOpts): LogEntry => {
    return this.addNode(LogLevel.error, { ...opts, entryStyle: EntryStyle.error })
  }

}

export class LogEntry extends LogNode {
  public opts: LogEntryOpts
  public status: EntryStatus
  public root: RootLogNode
  public timestamp: number
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

  protected setOwnState(opts: LogEntryOpts, status: EntryStatus): void {
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

  //  Update node and child nodes
  private deepSetState(opts: LogEntryOpts, status: EntryStatus): void {
    this.setOwnState(opts, status)
    getChildNodes(this).forEach(entry => {
      if (entry.status === EntryStatus.ACTIVE) {
        entry.setOwnState({}, EntryStatus.DONE)
      }
    })
  }

  // Preserves status
  public setState: UpdateLogEntry = (opts: LogEntryOpts = {}): LogEntry => {
    this.deepSetState(opts, this.status)
    this.root.onGraphChange(this)
    return this
  }

  public setDone: UpdateLogEntry = (opts: LogEntryOpts = {}): LogEntry => {
    this.deepSetState(opts, EntryStatus.DONE)
    this.root.onGraphChange(this)
    return this
  }

  public setSuccess: UpdateLogEntry = (opts: LogEntryOpts = {}): LogEntry => {
    this.deepSetState({ ...opts, symbol: LogSymbolType.success }, EntryStatus.SUCCESS)
    this.root.onGraphChange(this)
    return this
  }

  public setError: UpdateLogEntry = (opts: LogEntryOpts = {}): LogEntry => {
    this.deepSetState({ ...opts, symbol: LogSymbolType.error }, EntryStatus.ERROR)
    this.root.onGraphChange(this)
    return this
  }

  public setWarn: UpdateLogEntry = (opts: LogEntryOpts = {}): LogEntry => {
    this.deepSetState({ ...opts, symbol: LogSymbolType.warn }, EntryStatus.WARN)
    this.root.onGraphChange(this)
    return this
  }

  public originIsNotLogger(): boolean {
    return !!this.opts.originIsNotLogger
  }

  public stop() {
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

}

export class RootLogNode extends LogNode {
  public root: RootLogNode
  public writers: Writer[]

  constructor(config: LoggerConfig) {
    super(config.level, ROOT_DEPTH)
    this.root = this
    this.writers = config.writers || []
  }

  public onGraphChange(entry: LogEntry): void {
    this.writers.forEach(writer => writer.write(entry, this))
  }

  public getLogEntries(): LogEntry[] {
    return getChildNodes(<any>this).filter(entry => !entry.originIsNotLogger())
  }

  public header({ command, emoji }: { command: string, emoji?: string }): LogEntry {
    const msg = format([
      [() => chalk.bold.magenta(command), []],
      [() => emoji ? " " + nodeEmoji.get(emoji) : "", []],
      [() => "\n", []],
    ])
    return this.verbose({ msg })
  }

  public finish({ showDuration = true }: { showDuration?: boolean } = {}): LogEntry {
    const msg = format([
      [() => `\n${nodeEmoji.get("sparkles")}  Finished`, []],
      [() => showDuration ? ` in ${chalk.bold(duration(this.timestamp) + "s")}` : "!", []],
      [() => "\n", []],
    ])
    return this.info({ msg })
  }

  public stop(): void {
    this.getLogEntries().forEach(e => e.stop())
    this.writers.forEach(writer => writer.stop())
  }

}

export function getLogger(config: LoggerConfig = defaultLoggerConfig) {
  if (!loggerInstance) {
    loggerInstance = new RootLogNode(config)
  }

  return loggerInstance
}

export function setDefaultLoggerType(loggerType: LoggerType) {
  defaultLoggerType = loggerType
  defaultLoggerConfig = DEFAULT_CONFIGS[loggerType]
}

export function setDefaultLoggerConfig(config: LoggerConfig) {
  defaultLoggerConfig = config
}

// allow configuring logger type via environment variable
// TODO: we may want a more generalized mechanism for these types of env flags
if (process.env.GARDEN_LOGGER_TYPE) {
  const type = LoggerType[process.env.GARDEN_LOGGER_TYPE]

  if (!type) {
    throw new ParameterError(`Invalid logger type specified: ${process.env.GARDEN_LOGGER_TYPE}`, {
      loggerType: process.env.GARDEN_LOGGER_TYPE,
      availableTypes: Object.keys(LoggerType),
    })
  }

  defaultLoggerType = type
  defaultLoggerConfig = DEFAULT_CONFIGS[type]
  getLogger().debug({ msg: `Setting logger type to ${type} (from GARDEN_LOGGER_TYPE)` })
}
