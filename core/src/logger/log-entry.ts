/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import logSymbols from "log-symbols"
import { cloneDeep, round } from "lodash"

import { LogLevel } from "./logger"
import { Omit } from "../util/util"
import { GardenError } from "../exceptions"
import { Logger } from "./logger"
import uniqid from "uniqid"
import chalk from "chalk"

export type LogSymbol = keyof typeof logSymbols | "empty"
export type TaskLogStatus = "active" | "success" | "error"

export interface LogMetadata {
  // TODO Remove this in favour of reading the task data from the (action) context.
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

interface CoreLogContext {
  name?: string
}

interface ActionLogContext {
  actionName: string
  actionKind: string
}

// Common Log config that the class implements and other interfaces pick / omit from.
interface LogConfig {
  /**
   * A unique ID that's assigned to the config when it's created.
   */
  key: string
  timestamp: string
  type: "coreLog" | "actionLog"
  /**
   * Additional metadata to pass to the log context. The metadata gets added to
   * all log entries which can optionally extend it.
   */
  metadata?: LogMetadata
  section?: string
  origin?: string
  /**
   * Fix the level of all log entries created by this Log such that they're
   * geq to this value.
   *
   *  Useful to enforce the level in a given log context, e.g.:
   *  const debugLog = log.createLog({ fixLevel: LogLevel.debug })
   */
  fixLevel?: LogLevel
  context: CoreLogContext | ActionLogContext
  /**
   * Append the duration from when the log context was created and until the
   * success or error methods or call to the message.
   * E.g.: If calling `log.sucess(Done!)`, then the log message becomes "Done! (in 4 sec)".
   */
  showDuration?: boolean
}

interface LogConstructor extends Omit<LogConfig, "key" | "timestamp" | "type"> {
  root: Logger
  parentConfigs: LogConfig[]
}
interface CoreLogConstructor extends LogConstructor {
  context: CoreLogContext
}
interface ActionLogConstructor extends Omit<LogConstructor, "showDuration"> {
  context: ActionLogContext
}

interface CreateCoreLogParams extends Pick<LogConfig, "metadata" | "fixLevel" | "section" | "showDuration" | "origin"> {
  /**
   * The name of the log context. Will be printed as the "section" part of the log lines
   * belonging to this context.
   * TODO @eysi: Replace section with name and remove.
   */
  name?: string
}
interface CreateActionLogParams extends Pick<LogConfig, "metadata" | "fixLevel" | "origin"> {}

interface LogEntryBase extends Pick<LogConfig, "metadata" | "section"> {
  type: "coreLogEntry" | "actionLogEntry"
  timestamp: string
  /**
   * A unique ID that's assigned to the entry when it's created.
   */
  key: string
  /**
   * The unique ID of the log context that created the log entry.
   */
  parentLogKey: string
  level: LogLevel
  /**
   * Metadata about the context in which the log was created.
   * Used for rendering contextual information alongside the actual message.
   */
  context: LogContext
  /**
   * Reference to what created the log message, e.g. tool that generated it (such as "docker")
   */
  origin?: string
  msg?: string
  symbol?: LogSymbol
  data?: any
  dataFormat?: "json" | "yaml"
  error?: GardenError
}
interface CoreLogEntry extends LogEntryBase {
  type: "coreLogEntry"
  context: CoreLogContext
}
interface ActionLogEntry extends LogEntryBase {
  type: "actionLogEntry"
  context: ActionLogContext
}

interface LogParams
  extends Pick<LogEntryBase, "metadata" | "section" | "msg" | "symbol" | "data" | "dataFormat" | "error" | "origin"> {}
interface CreateLogEntryParams extends LogParams {
  level: LogLevel
}

// Setting these utility union types so that it's easy to add more.
export type LogEntry = CoreLogEntry | ActionLogEntry
type LogContext = CoreLogContext | ActionLogContext
type LogType = CoreLog | ActionLog
type CreateLogParams = CreateCoreLogParams | CreateActionLogParams

export function createActionLog({
  log,
  actionName,
  actionKind,
  metadata,
  origin,
}: {
  log: Log
  actionName: string
  actionKind: string
  metadata?: LogMetadata
  origin?: string
}) {
  return new ActionLog({
    parentConfigs: [...log.parentConfigs, log.getConfig()],
    metadata,
    origin,
    root: log.root,
    context: {
      actionName,
      actionKind,
    },
  })
}

export abstract class Log implements LogConfig {
  public readonly showDuration?: boolean
  public readonly type: "coreLog" | "actionLog"
  public readonly metadata?: LogMetadata
  public readonly key: string
  public readonly parentConfigs: LogConfig[]
  public readonly timestamp: string
  public readonly root: Logger
  public readonly section?: string
  public readonly origin?: string
  public readonly fixLevel?: LogLevel
  public readonly entries: LogEntry[]
  public readonly context: LogContext

  constructor(params: LogConstructor) {
    this.key = uniqid()
    this.entries = []
    this.timestamp = new Date().toISOString()
    this.parentConfigs = params.parentConfigs || []
    this.root = params.root
    this.fixLevel = params.fixLevel
    this.metadata = params.metadata
    // Require section? (Won't be needed for ActionLog and PluginLog)
    this.section = params.section
    this.origin = params.origin
    this.context = params.context
    this.showDuration = params.showDuration || false
  }

  protected abstract createLogEntry(params: CreateLogEntryParams): LogEntry

  /**
   * Create a new Log with the same context, optionally overwriting some fields.
   */
  abstract createLog(params: CreateLogParams): LogType

  private log(params: CreateLogEntryParams) {
    const entry = this.createLogEntry(params)
    if (this.root.storeEntries) {
      this.entries.push(entry)
    }
    this.root.log(entry)
    return this
  }

  private withDuration(params: CreateLogEntryParams) {
    if (this.showDuration && params.msg) {
      params.msg = params.msg + ` (in ${this.getDuration(1)} sec)`
    }
    return params
  }

  protected createLogEntryBase(params: CreateLogEntryParams): Omit<LogEntry, "type"> {
    const level = this.fixLevel ? Math.max(this.fixLevel, params.level) : params.level
    const section = params.section || this.section

    let metadata: LogMetadata | undefined = undefined
    if (this.metadata || params.metadata) {
      metadata = { ...cloneDeep(this.metadata || {}), ...(params.metadata || {}) }
    }

    return {
      section,
      ...params,
      origin: params.origin || this.origin,
      parentLogKey: this.key,
      context: this.context,
      level,
      timestamp: new Date().toISOString(),
      metadata,
      key: uniqid(),
    }
  }

  private resolveCreateParams(level: LogLevel, params: string | LogParams): CreateLogEntryParams {
    if (typeof params === "string") {
      return { msg: params, level }
    }
    return { ...params, level }
  }

  silly(params: string | LogParams) {
    return this.log(this.resolveCreateParams(LogLevel.silly, params))
  }

  debug(params: string | LogParams) {
    return this.log(this.resolveCreateParams(LogLevel.debug, params))
  }

  verbose(params: string | LogParams) {
    return this.log(this.resolveCreateParams(LogLevel.verbose, params))
  }

  info(params: string | LogParams) {
    return this.log(this.resolveCreateParams(LogLevel.info, params))
  }

  warn(params: string | LogParams) {
    return this.log(this.resolveCreateParams(LogLevel.warn, params))
  }

  error(params: string | LogParams) {
    const config = {
      ...this.resolveCreateParams(LogLevel.error, params || {}),
      symbol: "error" as LogSymbol,
    }
    config.msg = chalk.red(this.withDuration(config).msg)
    return this.log(config)
  }

  success(params: string | Omit<LogParams, "symbol">) {
    const config = {
      ...this.resolveCreateParams(LogLevel.info, params || {}),
      symbol: "success" as LogSymbol,
    }
    config.msg = chalk.green(this.withDuration(config).msg)
    return this.info(config)
  }

  getConfig(): LogConfig {
    return {
      context: this.context,
      metadata: this.metadata,
      timestamp: this.timestamp,
      key: this.key,
      section: this.section,
      fixLevel: this.fixLevel,
      type: this.type,
    }
  }

  getLatestEntry() {
    return this.entries.slice(-1)[0]
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

  toSanitizedValue() {
    // TODO: add a bit more info here
    return "<Log>"
  }
}

export class CoreLog extends Log {
  public readonly type = "coreLog"
  public entries: CoreLogEntry[]
  public context: CoreLogContext

  constructor(params: CoreLogConstructor) {
    super(params)
  }

  createLogEntry(params: CreateLogEntryParams): CoreLogEntry {
    return {
      ...this.createLogEntryBase(params),
      type: "coreLogEntry",
      context: this.context,
    }
  }

  /**
   * Create a new CoreLog with the same context, optionally overwriting some fields.
   *
   * TODO @eysi: It's a little awkward that you can overwrite the context of CoreLogs
   * but not others. Consider having a helper function for creating new CoreLogs and
   * using this only for cloning the context like we do e.g. with the ActionLog.
   */
  createLog(params: CreateCoreLogParams = {}) {
    return new CoreLog({
      metadata: params.metadata || this.metadata,
      fixLevel: params.fixLevel || this.fixLevel,
      section: params.section || this.section,
      origin: params.origin || this.origin,
      // The name is passed directly to the function to simplify call sites.
      context: {
        name: params.name || this.context.name,
      },
      root: this.root,
      parentConfigs: [...this.parentConfigs, this.getConfig()],
      showDuration: params.showDuration,
    })
  }
}

export class ActionLog extends Log {
  public readonly type = "actionLog"
  public readonly showDuration = true
  public readonly context: ActionLogContext
  public readonly entries: ActionLogEntry[]

  constructor(params: ActionLogConstructor) {
    super(params)
  }

  createLogEntry(params: CreateLogEntryParams): ActionLogEntry {
    return {
      ...this.createLogEntryBase(params),
      type: "actionLogEntry" as const,
      context: this.context,
    }
  }

  /**
   * Create a new ActionLog with the same context, optionally overwriting some fields.
   */
  createLog(params: CreateActionLogParams = {}) {
    return new ActionLog({
      metadata: params.metadata || this.metadata,
      fixLevel: params.fixLevel || this.fixLevel,
      origin: params.origin || this.origin,
      // Action log context is always inherited and does not get overwritten.
      context: this.context,
      root: this.root,
      parentConfigs: [...this.parentConfigs, this.getConfig()],
    })
  }
}
