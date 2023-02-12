/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import logSymbols from "log-symbols"
import nodeEmoji from "node-emoji"
import { cloneDeep, round } from "lodash"

import { LogLevel, logLevelMap } from "./logger"
import { Omit } from "../util/util"
import { findParentEntry } from "./util"
import { GardenError } from "../exceptions"
import { CreateLogEntryParams, Logger, PlaceholderOpts } from "./logger"
import uniqid from "uniqid"

export type EmojiName = keyof typeof nodeEmoji.emoji
export type LogSymbol = keyof typeof logSymbols | "empty"
export type TaskLogStatus = "active" | "success" | "error"

export interface LogEntryMetadata {
  task?: TaskMetadata
  workflowStep?: WorkflowStepMetadata
}

export interface TaskMetadata {
  type: string
  key: string
  status: TaskLogStatus
  uid: string
  inputVersion: string
  outputVersion?: string
  durationMs?: number
}

export interface WorkflowStepMetadata {
  index: number
}

interface MessageBase {
  msg?: string
  section?: string
  symbol?: LogSymbol
  data?: any
  dataFormat?: "json" | "yaml"
}

export interface LogEntryMessage extends MessageBase {
  timestamp: Date
}

interface LogCommonParams {
  id?: string
  metadata?: LogEntryMetadata
}

export interface LogEntryParams extends MessageBase, LogCommonParams {
  error?: GardenError
}

export interface LogConstructor extends LogCommonParams {
  section?: string
  level: LogLevel
  root: Logger
  parent?: Log
  fixLevel?: boolean
}

function resolveCreateParams(level: LogLevel, params: string | LogEntryParams): CreateLogEntryParams {
  if (typeof params === "string") {
    return { msg: params, level }
  }
  return { ...params, level }
}

interface LogEntryBase {
  type: "logEntry" | "actionLogEntry" | "pluginLogEntry"
  // TODO @eysi: Rename to text?
  msg?: string
  // TODO @eysi: Skip and only allow section on Log?
  section?: string
  symbol?: LogSymbol
  data?: any
  dataFormat?: "json" | "yaml"
  timestamp: string
  metadata?: LogEntryMetadata
  key: string
  level: LogLevel
  // TODO @eysi: Skip?
  errorData?: GardenError
  id?: string
  root: Logger
  parent: Log
}

export interface LogEntry extends LogEntryBase {
  type: "logEntry"
}

export class Log {
  public readonly metadata?: LogEntryMetadata
  public readonly parent?: Log
  public readonly timestamp: Date
  public readonly key: string
  public readonly level: LogLevel
  public readonly root: Logger
  public readonly section?: string
  public readonly errorData?: GardenError
  public readonly fixLevel?: boolean
  public readonly id?: string
  public readonly type: "logEntry"
  public entries: LogEntry[]

  constructor(params: LogConstructor) {
    this.key = uniqid()
    this.entries = []
    this.timestamp = new Date()
    this.level = params.level
    this.parent = params.parent
    this.id = params.id
    this.root = params.root
    this.fixLevel = params.fixLevel
    this.metadata = params.metadata
    this.id = params.id
    // Require section?
    this.section = params.section
  }

  private createLogEntry(params: CreateLogEntryParams) {
    // If fixLevel is set to true, all children must have a level geq to the level
    // of the parent entry that set the flag.
    const parentWithPreserveFlag = findParentEntry(this, (log) => !!log.fixLevel)
    const level = parentWithPreserveFlag ? Math.max(parentWithPreserveFlag.level, params.level) : params.level
    const section = params.section || this.section

    let metadata: LogEntryMetadata | undefined = undefined
    if (this.metadata || params.metadata) {
      metadata = { ...cloneDeep(this.metadata || {}), ...(params.metadata || {}) }
    }

    const logEntry: LogEntry = {
      type: "logEntry",
      section,
      ...params,
      // TODO @eysi: Why is it called errorData? And is it used at all?
      errorData: params.error,
      level,
      timestamp: new Date().toISOString(),
      metadata,
      // TODO @eysi: Do we need this?
      key: uniqid(),
      root: this.root,
      parent: this,
    }

    return logEntry
  }

  private log(params: CreateLogEntryParams): Log {
    const entry = this.createLogEntry(params)
    if (this.root.storeEntries) {
      this.entries.push(entry)
    }
    this.root.log(entry)
    return this
  }

  /**
   * Create a new logger with same context, optionally overwriting some fields.
   *
   * TODO @eysi: Overwrite with params
   */
  makeNewLogContext(params: Partial<LogConstructor>) {
    return new Log({
      level: params.level || this.level,
      section: params.section || this.section,
      parent: this,
      root: this.root,
      fixLevel: params.fixLevel || this.fixLevel,
      metadata: params.metadata || this.metadata,
    })
  }

  silly(params: string | LogEntryParams): Log {
    return this.log(resolveCreateParams(LogLevel.silly, params))
  }

  debug(params: string | LogEntryParams): Log {
    return this.log(resolveCreateParams(LogLevel.debug, params))
  }

  verbose(params: string | LogEntryParams): Log {
    return this.log(resolveCreateParams(LogLevel.verbose, params))
  }

  info(params: string | LogEntryParams): Log {
    return this.log(resolveCreateParams(LogLevel.info, params))
  }

  warn(params: string | LogEntryParams): Log {
    return this.log(resolveCreateParams(LogLevel.warn, params))
  }

  error(params: string | LogEntryParams): Log {
    return this.log(resolveCreateParams(LogLevel.error, params))
  }

  getLatestEntry() {
    return this.entries.slice(-1)[0]
  }

  placeholder({ level = LogLevel.info, fixLevel = false, metadata }: PlaceholderOpts = {}): Log {
    return new Log({
      level,
      metadata,
      fixLevel,
      root: this.root,
      parent: this,
    })
  }

  // TODO: Keeping this for now, will update in a follow up PR
  setSuccess(params?: string | Omit<LogEntryParams, "symbol">): Log {
    return this.info({
      ...resolveCreateParams(LogLevel.info, params || {}),
      symbol: "success",
    })
  }

  getLogEntries() {
    return this.entries
  }

  /**
   * Get the log level of the entry as a string.
   */
  getStringLevel(): string {
    return logLevelMap[this.level]
  }

  /**
   * Dumps the log entry and all child entries as a string, optionally filtering the entries with `filter`.
   * For example, to dump all the logs of level info or higher:
   *
   *   log.toString((entry) => entry.level <= LogLevel.info)
   */
  toString(filter?: (log: LogEntry) => boolean) {
    return this.getLogEntries()
      .filter((entry) => (filter ? filter(entry) : true))
      .map((entry) => entry.msg)
      .join("\n")
  }

  /**
   * Returns the duration in seconds, defaults to 2 decimal precision
   */
  getDuration(precision: number = 2): number {
    return round((new Date().getTime() - this.timestamp.getTime()) / 1000, precision)
  }
}
