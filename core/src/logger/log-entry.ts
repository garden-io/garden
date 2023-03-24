/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import logSymbols from "log-symbols"
import { cloneDeep, round } from "lodash"

import { LogLevel, logLevelMap } from "./logger"
import { Omit } from "../util/util"
import { findParentLogContext } from "./util"
import { Logger } from "./logger"
import uniqid from "uniqid"

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

interface LogCommonParams {
  id?: string
  metadata?: LogEntryMetadata
}

interface LogParams extends LogCommonParams {
  msg?: string
  /**
   * The log entry section. By default inherited from parent log context
   * but can optionally be overwritten here.
   */
  section?: string
  symbol?: LogSymbol
  data?: any
  dataFormat?: "json" | "yaml"
  error?: Error
}

interface CreateLogEntryParams extends LogParams {
  level: LogLevel
}

export interface LogEntry extends CreateLogEntryParams {
  type: "logEntry"
  timestamp: string
  metadata?: LogEntryMetadata
  key: string
  level: LogLevel
  id?: string
  root: Logger
}

export interface LogConstructor extends LogCommonParams {
  section?: string
  level: LogLevel
  root: Logger
  parent?: Log
  /**
   * If set to true, all log entries inherit the level of their parent log context.
   */
  fixLevel?: boolean
}

function resolveCreateParams(level: LogLevel, params: string | LogParams): CreateLogEntryParams {
  if (typeof params === "string") {
    return { msg: params, level }
  }
  return { ...params, level }
}

/**
 * The 'Log' class exposes function for logging information at different levels.
 *
 * Each instance of the class holds some log context that its entries inherit.
 * Typically a 'log' instance corresponds to a given 'section' so that its log entries share
 * a common format.
 *
 * A new log context can be created from an existing one in which case the new context inherits
 * its parent config with optional overwrites.
 *
 * Example:
 *
 * const buildLog = log.makeNewLogContext({ section: "build.api" })
 * const debugBuildLog = buildLog.makeNewLogContext({ level: LogLevel.debug, fixLevel: true })
 * buildLog.info("hello")
 */
export class Log {
  public readonly metadata?: LogEntryMetadata
  public readonly parent?: Log
  public readonly timestamp: string
  public readonly key: string
  // TODO @eysi: It doesn't really make sense to have a level on the Log class itself
  // unless 'fixLevel' is also set. Consider merging the two.
  public readonly level: LogLevel
  public readonly root: Logger
  public readonly section?: string
  public readonly fixLevel?: boolean
  public readonly id?: string
  public readonly type: "log"
  public entries: LogEntry[]

  constructor(params: LogConstructor) {
    this.key = uniqid()
    this.entries = []
    this.timestamp = new Date().toISOString()
    this.level = params.level
    this.parent = params.parent
    this.id = params.id
    this.root = params.root
    this.fixLevel = params.fixLevel
    this.metadata = params.metadata
    this.id = params.id
    // Require section? (Won't be needed for ActionLog and PluginLog)
    this.section = params.section
  }

  toSanitizedValue() {
    // TODO: add a bit more info here
    return "<Log>"
  }

  private createLogEntry(params: CreateLogEntryParams) {
    // If fixLevel is set to true, all children must have a level geq to the level
    // of the parent entry that set the flag.
    const parentWithPreserveFlag = findParentLogContext(this, (log) => !!log.fixLevel)
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
      error: params.error,
      level,
      timestamp: new Date().toISOString(),
      metadata,
      key: uniqid(),
      root: this.root,
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

  silly(params: string | LogParams): Log {
    return this.log(resolveCreateParams(LogLevel.silly, params))
  }

  debug(params: string | LogParams): Log {
    return this.log(resolveCreateParams(LogLevel.debug, params))
  }

  verbose(params: string | LogParams): Log {
    return this.log(resolveCreateParams(LogLevel.verbose, params))
  }

  info(params: string | LogParams): Log {
    return this.log(resolveCreateParams(LogLevel.info, params))
  }

  warn(params: string | LogParams): Log {
    return this.log(resolveCreateParams(LogLevel.warn, params))
  }

  error(params: string | LogParams): Log {
    return this.log(resolveCreateParams(LogLevel.error, params))
  }

  getLatestEntry() {
    return this.entries.slice(-1)[0]
  }

  // TODO: Keeping this for now, will update in a follow up PR
  setSuccess(params?: string | Omit<LogParams, "symbol">): Log {
    return this.info({
      ...resolveCreateParams(LogLevel.info, params || {}),
      symbol: "success",
    })
  }

  getChildLogEntries() {
    return this.entries
  }

  getAllLogEntries() {
    return this.root.getLogEntries()
  }

  /**
   * Get the log level of the entry as a string.
   */
  getStringLevel(): string {
    return logLevelMap[this.level]
  }

  /**
   * Dumps child entries as a string, optionally filtering the entries with `filter`.
   * For example, to dump all the logs of level info or higher:
   *
   *   log.toString((entry) => entry.level <= LogLevel.info)
   */
  toString(filter?: (log: LogEntry) => boolean) {
    return this.getChildLogEntries()
      .filter((entry) => (filter ? filter(entry) : true))
      .map((entry) => entry.msg)
      .join("\n")
  }

  /**
   * Returns the duration in seconds, defaults to 2 decimal precision
   */
  getDuration(precision: number = 2): number {
    return round((new Date().getTime() - new Date(this.timestamp).getTime()) / 1000, precision)
  }
}
