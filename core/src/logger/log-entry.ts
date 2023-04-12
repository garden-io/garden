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

interface BaseContext {
  /**
   * Reference to what created the log message, e.g. tool that generated it (such as "docker")
   */
  origin?: string
  type: "coreLog" | "actionLog"
}

export interface CoreLogContext extends BaseContext {
  type: "coreLog"
  /**
   * The name of the log context. Will be printed as the "section" part of the log lines
   * belonging to this context.
   */
  name?: string
}
export interface ActionLogContext extends BaseContext {
  type: "actionLog"
  actionName: string
  actionKind: string
}

type LogContext = CoreLogContext | ActionLogContext

// Common Log config that the class implements and other interfaces pick / omit from.
interface LogConfig<C extends BaseContext> {
  /**
   * A unique ID that's assigned to the config when it's created.
   */
  key: string
  timestamp: string
  /**
   * Additional metadata to pass to the log context. The metadata gets added to
   * all log entries which can optionally extend it.
   */
  metadata?: LogMetadata
  section?: string
  /**
   * Fix the level of all log entries created by this Log such that they're
   * geq to this value.
   *
   *  Useful to enforce the level in a given log context, e.g.:
   *  const debugLog = log.createLog({ fixLevel: LogLevel.debug })
   */
  fixLevel?: LogLevel
  context: C
  /**
   * Append the duration from when the log context was created and until the
   * success or error methods or call to the message.
   * E.g.: If calling `log.sucess(Done!)`, then the log message becomes "Done! (in 4 sec)".
   */
  showDuration?: boolean
}

interface LogConstructor<C extends BaseContext> extends Omit<LogConfig<C>, "key" | "timestamp"> {
  root: Logger
  parentConfigs: LogConfig<LogContext>[]
}

interface CreateLogParams
  extends Pick<LogConfig<LogContext>, "metadata" | "fixLevel" | "section" | "showDuration">,
  Pick<LogContext, "origin"> { }

interface CreateCoreLogParams
  extends Pick<LogConfig<CoreLogContext>, "metadata" | "fixLevel" | "section" | "showDuration">,
  Pick<CoreLogContext, "name" | "origin"> {
  name: string
  origin?: string
}

export interface LogEntry<C extends BaseContext = LogContext>
  extends Pick<LogConfig<C>, "metadata" | "section" | "context"> {
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
  msg?: string
  symbol?: LogSymbol
  data?: any
  dataFormat?: "json" | "yaml"
  error?: GardenError
}

interface LogParams
  extends Pick<LogEntry, "metadata" | "section" | "msg" | "symbol" | "data" | "dataFormat" | "error">,
  Pick<LogContext, "origin"> {}

interface CreateLogEntryParams extends LogParams {
  level: LogLevel
}

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
  return new Log<ActionLogContext>({
    parentConfigs: [...log.parentConfigs, log.getConfig()],
    metadata,
    root: log.root,
    context: {
      type: "actionLog",
      origin,
      actionName,
      actionKind,
    },
  })
}

function isCreateCoreLogParams(params: any): params is CreateCoreLogParams {
  if (params.name) {
    return true
  }
  return false
}

export class Log<C extends BaseContext = LogContext> implements LogConfig<C> {
  public readonly showDuration?: boolean
  public readonly metadata?: LogMetadata
  public readonly key: string
  public readonly parentConfigs: LogConfig<LogContext>[]
  public readonly timestamp: string
  public readonly root: Logger
  public readonly section?: string
  public readonly fixLevel?: LogLevel
  // FIXME: We're not doing LogEntry<C> here which means we don't know the context type
  // when looking up log.entries.
  // Using the generic C causes issues when calling this.root.log and since we
  // don't really need to know the context type anyway we let it slide.
  public readonly entries: LogEntry[]
  public readonly context: C

  constructor(params: LogConstructor<C>) {
    this.key = uniqid()
    this.entries = []
    this.timestamp = new Date().toISOString()
    this.parentConfigs = params.parentConfigs || []
    this.root = params.root
    this.fixLevel = params.fixLevel
    this.metadata = params.metadata
    // TODO: Remove section?
    this.section = params.section
    this.context = params.context
    this.showDuration = params.showDuration || false
  }

  protected createLogEntry(params: CreateLogEntryParams): LogEntry<C> {
    const level = this.fixLevel ? Math.max(this.fixLevel, params.level) : params.level
    const section = params.section || this.section

    let metadata: LogMetadata | undefined = undefined
    if (this.metadata || params.metadata) {
      metadata = { ...cloneDeep(this.metadata || {}), ...(params.metadata || {}) }
    }

    return {
      ...params,
      section,
      parentLogKey: this.key,
      context: {
        ...this.context,
        origin: params.origin || this.context.origin,
      },
      level,
      timestamp: new Date().toISOString(),
      metadata,
      key: uniqid(),
    }
  }

  /**
   * Create a new Log instance which inherits context and other data from the parent instance, but
   * optionally overwriting some fields.
   *
   * By default this function returns a Log instance of the same type as the caller.
   * So e.g. actionLog.createLog() returns a log of type Log<ActionLogContext> (assuming actionLog
   + has that type).
   *
   * It can also explictly create a log of type Log<CoreLogContext> by passing the relevant parameter.
   * This is mostly for convenience and compatibility with the previous version, although a admittedly
   * a little awkward. We may revisit as we add more context types.
   */
  createLog(): Log<C>
  createLog(params: CreateLogParams): Log<C>
  createLog(params: CreateCoreLogParams): Log<CoreLogContext>
  createLog(params: CreateLogParams | CreateCoreLogParams | void): Log<C | CoreLogContext> {
    // TODO @eysi: Figure out a better way to do this
    let context: C
    if (isCreateCoreLogParams(params)) {
      context = { type: "coreLog", name: params.name, origin: params.origin } as unknown as C
    } else {
      context = this.context as C
    }
    const config = this.getConfig() as LogConfig<LogContext>
    return new Log<C>({
      metadata: params ? params.metadata : this.metadata,
      fixLevel: params ? params.fixLevel : this.fixLevel,
      section: params ? params.section : this.section,
      context,
      root: this.root,
      parentConfigs: [...this.parentConfigs, config],
    })
  }

  private log(params: CreateLogEntryParams) {
    const entry = this.createLogEntry(params) as LogEntry
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

  getConfig(): LogConfig<C> {
    return {
      context: this.context,
      metadata: this.metadata,
      timestamp: this.timestamp,
      key: this.key,
      section: this.section,
      fixLevel: this.fixLevel,
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
