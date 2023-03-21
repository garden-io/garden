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

// TODO @eysi: Would be good to get rid of this
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
   * TODO @eysi: In fact, lets remove in favour of context
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

interface LogContext {
  name: string
}

// TODO @eysi: What other data would we nee here?
interface ActionLogContext {
  actionName: string
  actionKind: string
}

// TODO @eysi: Consider nesting the message data (msg, section, symbol etc) under a "message" field.
interface LogEntryBase extends CreateLogEntryParams {
  type: "logEntry" | "actionLogEntry"
  timestamp: string
  /**
   * A unique ID that's assigned to the entry when it's created.
   */
  key: string
  level: LogLevel
  /**
   * The root logger is attached to the LogEntry for convenience.
   * TODO: Consider removing so that the log entry is just a POJO.
   */
  root: Logger
  /**
   * Metadata about the context in which the log was created.
   * Used for rendering contextual information alongside the actual message.
   */
  context: LogContext | ActionLogContext
}

export interface LogEntry extends LogEntryBase {
  type: "logEntry"
  metadata?: LogEntryMetadata
}

export interface ActionLogEntry extends LogEntryBase {
  type: "actionLogEntry"
  context: ActionLogContext
}

export interface LogConstructor extends LogCommonParams {
  section?: string
  root: Logger
  parent?: Log
  /**
   * Fix the level of all log entries created by this Log such that they're
   * geq to this value.
   *  
   *  Useful to enforce the level in a given log context, e.g.:
   *  const debugLog = log.makeNewLogContext({ fixLevel: LogLevel.debug })
   */
  fixLevel?: LogLevel
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
 * const debugBuildLog = buildLog.makeNewLogContext({ fixLevel: LogLevel.verbose })
 * buildLog.info("hello")
 */
export class Log {
  public readonly metadata?: LogEntryMetadata
  public readonly parent?: Log
  public readonly timestamp: string
  public readonly key: string
  // TODO @eysi: It doesn't really make sense to have a level on the Log class itself
  // unless 'fixLevel' is also set. Consider merging the two.
  public readonly root: Logger
  public readonly section?: string
  public readonly fixLevel?: LogLevel
  public readonly id?: string
  public readonly type: "log"
  public entries: LogEntry[]

  constructor(params: LogConstructor) {
    this.key = uniqid()
    this.entries = []
    this.timestamp = new Date().toISOString()
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
    const level = this.fixLevel ? Math.max(this.fixLevel, params.level)  : params.level
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
      // TODO
      context: {
        name: ""
      }
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
   * TODO @eysi: Do not use Partial<> here.
   */
  makeNewLogContext(params: Partial<LogConstructor>) {
    return new Log({
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
