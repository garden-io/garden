/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as nodeEmoji from "node-emoji"
import chalk from "chalk"

import { combine } from "./renderers"
import {
  duration,
  findLogEntry,
  getChildEntries,
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
import { BasicConsoleWriter, FancyConsoleWriter, Writer } from "./writers"
import { ParameterError } from "../exceptions"

const ROOT_DEPTH = -1
const CONFIG_TYPES: { [key in LoggerType]: LoggerConfig } = {
  [LoggerType.fancy]: {
    level: LogLevel.info,
    writers: [new FancyConsoleWriter()],
  },
  [LoggerType.basic]: {
    level: LogLevel.info,
    writers: [new BasicConsoleWriter()],
  },
  [LoggerType.quiet]: {
    level: LogLevel.info,
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
  parentEntry?: LogEntry
}

let loggerInstance: RootLogNode
let loggerType: LoggerType = LoggerType.fancy
let loggerConfig: LoggerConfig = CONFIG_TYPES[loggerType]

function createLogEntry(level: LogLevel, opts: LogEntryOpts, parentNode: LogNode) {
  const { depth, root } = parentNode
  let parentEntry
  if (parentNode.depth > ROOT_DEPTH) {
    parentEntry = parentNode
  }
  const params = {
    depth: depth + 1,
    root,
    level,
    opts,
    parentEntry,
  }
  return new LogEntry(params)
}

export type CreateLogEntryParam = string | LogEntryOpts
export type CreateLogEntry = (entryVal: CreateLogEntryParam) => LogEntry
export type UpdateLogEntryParam = string | LogEntryOpts | undefined
export type UpdateLogEntry = (entryVal?: UpdateLogEntryParam) => LogEntry

function makeLogOpts(entryVal: CreateLogEntryParam | UpdateLogEntryParam): LogEntryOpts {
  return typeof entryVal === "string" ? { msg: entryVal } : entryVal || {}
}

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

  public silly: CreateLogEntry = (entryVal: CreateLogEntryParam): LogEntry => {
    return this.addNode(LogLevel.silly, makeLogOpts(entryVal))
  }

  public debug: CreateLogEntry = (entryVal: CreateLogEntryParam): LogEntry => {
    return this.addNode(LogLevel.debug, makeLogOpts(entryVal))
  }

  public verbose: CreateLogEntry = (entryVal: CreateLogEntryParam): LogEntry => {
    return this.addNode(LogLevel.verbose, makeLogOpts(entryVal))
  }

  public info: CreateLogEntry = (entryVal: CreateLogEntryParam): LogEntry => {
    return this.addNode(LogLevel.info, makeLogOpts(entryVal))
  }

  public warn: CreateLogEntry = (entryVal: CreateLogEntryParam): LogEntry => {
    return this.addNode(LogLevel.warn, makeLogOpts(entryVal))
  }

  public error: CreateLogEntry = (entryVal: CreateLogEntryParam): LogEntry => {
    return this.addNode(LogLevel.error, { ...makeLogOpts(entryVal), entryStyle: EntryStyle.error })
  }

  public findById(id: string): LogEntry | void {
    return findLogEntry(this, entry => entry.opts.id === id)
  }

  public filterBySection(section: string): LogEntry[] {
    return getChildEntries(this).filter(entry => entry.opts.section === section)
  }

}

export class LogEntry extends LogNode {
  public opts: LogEntryOpts
  public status: EntryStatus
  public root: RootLogNode
  public timestamp: number
  public level: LogLevel
  public depth: number
  public parentEntry: LogEntry | undefined
  public children: LogEntry[]

  constructor({ level, opts, depth, root, parentEntry }: LogEntryConstructor) {
    super(level, depth)
    this.root = root
    this.parentEntry = parentEntry
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
    getChildEntries(this).forEach(entry => {
      if (entry.status === EntryStatus.ACTIVE) {
        entry.setOwnState({}, EntryStatus.DONE)
      }
    })
  }

  // Preserves status
  public setState: UpdateLogEntry = (entryVal: UpdateLogEntryParam = {}): LogEntry => {
    this.deepSetState(makeLogOpts(entryVal), this.status)
    this.root.onGraphChange(this)
    return this
  }

  public setDone: UpdateLogEntry = (entryVal: UpdateLogEntryParam = {}): LogEntry => {
    this.deepSetState(makeLogOpts(entryVal), EntryStatus.DONE)
    this.root.onGraphChange(this)
    return this
  }

  public setSuccess: UpdateLogEntry = (entryVal: UpdateLogEntryParam = {}): LogEntry => {
    this.deepSetState({ ...makeLogOpts(entryVal), symbol: LogSymbolType.success }, EntryStatus.SUCCESS)
    this.root.onGraphChange(this)
    return this
  }

  public setError: UpdateLogEntry = (entryVal: UpdateLogEntryParam = {}): LogEntry => {
    this.deepSetState({ ...makeLogOpts(entryVal), symbol: LogSymbolType.error }, EntryStatus.ERROR)
    this.root.onGraphChange(this)
    return this
  }

  public setWarn: UpdateLogEntry = (entryVal: UpdateLogEntryParam = {}): LogEntry => {
    this.deepSetState({ ...makeLogOpts(entryVal), symbol: LogSymbolType.warn }, EntryStatus.WARN)
    this.root.onGraphChange(this)
    return this
  }

  public notOriginatedFromLogger(): boolean {
    return !!this.opts.notOriginatedFromLogger
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
    return getChildEntries(this).filter(entry => !entry.notOriginatedFromLogger())
  }

  public header(
    { command, emoji, level = LogLevel.info }: { command: string, emoji?: string, level?: LogLevel },
  ): LogEntry {
    const msg = combine([
      [chalk.bold.magenta(command)],
      [emoji ? " " + nodeEmoji.get(emoji) : ""],
      ["\n"],
    ])
    const lvlStr = LogLevel[level]
    return this[lvlStr](msg)
  }

  public finish(
    { showDuration = true, level = LogLevel.info }: { showDuration?: boolean, level?: LogLevel } = {},
  ): LogEntry {
    const msg = combine([
      [`\n${nodeEmoji.get("sparkles")}  Finished`],
      [showDuration ? ` in ${chalk.bold(duration(this.timestamp) + "s")}` : "!"],
      ["\n"],
    ])
    const lvlStr = LogLevel[level]
    return this[lvlStr](msg)
  }

  public stop(): void {
    this.getLogEntries().forEach(e => e.stop())
    this.writers.forEach(writer => writer.stop())
  }

}

export function getLogger() {
  if (!loggerInstance) {
    loggerInstance = new RootLogNode(loggerConfig)
  }

  return loggerInstance
}

export function setLoggerType(type: LoggerType) {
  loggerType = type
  loggerConfig = CONFIG_TYPES[type]
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

  setLoggerType(type)

  getLogger().debug(`Setting logger type to ${type} (from GARDEN_LOGGER_TYPE)`)
}
