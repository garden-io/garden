/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as nodeEmoji from "node-emoji"
import * as uniqid from "uniqid"
import { round } from "lodash"
import chalk from "chalk"

import { combine } from "./renderers"
import {
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
import { Writer } from "./writers/base"
import { ParameterError, InternalError } from "../exceptions"
import { BasicTerminalWriter } from "./writers/basic-terminal-writer"
import { FancyTerminalWriter } from "./writers/fancy-terminal-writer"

const ROOT_DEPTH = -1

function getCommonConfig(loggerType: LoggerType): LoggerConfig {
  const configs: { [key in LoggerType]: LoggerConfig } = {
    [LoggerType.fancy]: {
      level: LogLevel.info,
      writers: [new FancyTerminalWriter()],
    },
    [LoggerType.basic]: {
      level: LogLevel.info,
      writers: [new BasicTerminalWriter()],
    },
    [LoggerType.quiet]: {
      level: LogLevel.info,
    },
  }
  return configs[loggerType]
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
  key: string
  parentEntry?: LogEntry
}

function createLogEntry(level: LogLevel, opts: LogEntryOpts, parentNode: LogNode): LogEntry {
  const { depth, root } = parentNode
  const key = uniqid()
  let parentEntry
  if (parentNode.depth > ROOT_DEPTH) {
    parentEntry = parentNode
  }
  const params: LogEntryConstructor = {
    depth: depth + 1,
    key,
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

function prepareLogOpts(entryVal: CreateLogEntryParam | UpdateLogEntryParam): LogEntryOpts {
  return typeof entryVal === "string" ? { msg: entryVal } : entryVal || {}
}

export abstract class LogNode {
  public readonly root: RootLogNode
  public readonly timestamp: number
  public readonly level: LogLevel
  public readonly depth: number
  public readonly children: LogEntry[]

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
    return this.addNode(LogLevel.silly, prepareLogOpts(entryVal))
  }

  public debug: CreateLogEntry = (entryVal: CreateLogEntryParam): LogEntry => {
    return this.addNode(LogLevel.debug, prepareLogOpts(entryVal))
  }

  public verbose: CreateLogEntry = (entryVal: CreateLogEntryParam): LogEntry => {
    return this.addNode(LogLevel.verbose, prepareLogOpts(entryVal))
  }

  public info: CreateLogEntry = (entryVal: CreateLogEntryParam): LogEntry => {
    return this.addNode(LogLevel.info, prepareLogOpts(entryVal))
  }

  public warn: CreateLogEntry = (entryVal: CreateLogEntryParam): LogEntry => {
    return this.addNode(LogLevel.warn, prepareLogOpts(entryVal))
  }

  public error: CreateLogEntry = (entryVal: CreateLogEntryParam): LogEntry => {
    return this.addNode(LogLevel.error, { ...prepareLogOpts(entryVal), entryStyle: EntryStyle.error })
  }

  public findById(id: string): LogEntry | void {
    return findLogEntry(this, entry => entry.opts.id === id)
  }

  public filterBySection(section: string): LogEntry[] {
    return getChildEntries(this).filter(entry => entry.opts.section === section)
  }

  /**
   * Returns the duration in seconds, defaults to 2 decimal precision
   */
  public getDuration(precision: number = 2): number {
    return round((Date.now() - this.timestamp) / 1000, precision)
  }

}

export class LogEntry extends LogNode {
  public opts: LogEntryOpts
  public status: EntryStatus
  public readonly root: RootLogNode
  public readonly timestamp: number
  public readonly level: LogLevel
  public readonly depth: number
  public readonly key: string
  public readonly parentEntry: LogEntry | undefined
  public readonly children: LogEntry[]

  constructor({ level, opts, depth, root, parentEntry, key }: LogEntryConstructor) {
    super(level, depth)
    this.root = root
    this.parentEntry = parentEntry
    this.key = key
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
    this.deepSetState(prepareLogOpts(entryVal), this.status)
    this.root.onGraphChange(this)
    return this
  }

  public setDone: UpdateLogEntry = (entryVal: UpdateLogEntryParam = {}): LogEntry => {
    this.deepSetState(prepareLogOpts(entryVal), EntryStatus.DONE)
    this.root.onGraphChange(this)
    return this
  }

  public setSuccess: UpdateLogEntry = (entryVal: UpdateLogEntryParam = {}): LogEntry => {
    this.deepSetState({ ...prepareLogOpts(entryVal), symbol: LogSymbolType.success }, EntryStatus.SUCCESS)
    this.root.onGraphChange(this)
    return this
  }

  public setError: UpdateLogEntry = (entryVal: UpdateLogEntryParam = {}): LogEntry => {
    this.deepSetState({ ...prepareLogOpts(entryVal), symbol: LogSymbolType.error }, EntryStatus.ERROR)
    this.root.onGraphChange(this)
    return this
  }

  public setWarn: UpdateLogEntry = (entryVal: UpdateLogEntryParam = {}): LogEntry => {
    this.deepSetState({ ...prepareLogOpts(entryVal), symbol: LogSymbolType.warn }, EntryStatus.WARN)
    this.root.onGraphChange(this)
    return this
  }

  public fromStdStream(): boolean {
    return !!this.opts.fromStdStream
  }

  public stop() {
    // Stop gracefully if still in active state
    if (this.status === EntryStatus.ACTIVE) {
      this.setOwnState({ symbol: LogSymbolType.empty }, EntryStatus.DONE)
      this.root.onGraphChange(this)
    }
    return this
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
  public readonly root: RootLogNode
  public writers: Writer[]

  private static instance: RootLogNode

  static getInstance() {
    if (!RootLogNode.instance) {
      throw new InternalError("Logger not initialized", {})
    }
    return RootLogNode.instance
  }

  static initialize(config: LoggerConfig) {
    if (RootLogNode.instance) {
      throw new InternalError("Logger already initialized", {})
    }

    let instance

    // If GARDEN_LOGGER_TYPE env variable is set it takes precedence over the config param
    if (process.env.GARDEN_LOGGER_TYPE) {
      const loggerType = LoggerType[process.env.GARDEN_LOGGER_TYPE]

      if (!loggerType) {
        throw new ParameterError(`Invalid logger type specified: ${process.env.GARDEN_LOGGER_TYPE}`, {
          loggerType: process.env.GARDEN_LOGGER_TYPE,
          availableTypes: Object.keys(LoggerType),
        })
      }

      instance = new RootLogNode(getCommonConfig(loggerType))
      instance.debug(`Setting logger type to ${loggerType} (from GARDEN_LOGGER_TYPE)`)
    } else {
      instance = new RootLogNode(config)
    }

    RootLogNode.instance = instance
    return instance
  }

  private constructor(config: LoggerConfig) {
    super(config.level, ROOT_DEPTH)
    this.root = this
    this.writers = config.writers || []
  }

  public onGraphChange(entry: LogEntry): void {
    this.writers.forEach(writer => writer.onGraphChange(entry, this))
  }

  public getLogEntries(): LogEntry[] {
    return getChildEntries(this).filter(entry => !entry.fromStdStream())
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
      [showDuration ? ` in ${chalk.bold(this.getDuration() + "s")}` : "!"],
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
  return RootLogNode.getInstance()
}
