/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type logSymbols from "log-symbols"
import cloneDeep from "fast-copy"
import { round, memoize } from "lodash-es"

import { LogLevel } from "./logger.js"
import type { Omit } from "../util/util.js"
import type { Logger } from "./logger.js"
import uniqid from "uniqid"
import type { GardenError } from "../exceptions.js"
import { omitUndefined } from "../util/objects.js"
import { renderDuration } from "./util.js"
import { styles } from "./styles.js"
import { getStyle } from "./renderers.js"
import hasAnsi from "has-ansi"

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
  inputVersion: string | null
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
  /**
   * A session ID, to identify the log entry as part of a specific command execution.
   */
  sessionId?: string
  /**
   * If applicable, the session ID of the parent command (e.g. serve or dev)
   */
  parentSessionId?: string
  /**
   * The key of a Garden instance, if applicable.
   */
  gardenKey?: string
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
  /**
   * The name of the action that produced the log entry. Is printed in the "section" part of the log lines.
   */
  actionName: string
  /**
   * The kind of the action that produced the log entry. Is printed in the "section" part of the log lines.
   */
  actionKind: string
}

export type LogContext = CoreLogContext | ActionLogContext

/**
 * Common Log config that the class implements and other interfaces pick / omit from.
 */
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
   * success or error methods are called to the success/error message.
   * E.g.: If calling `log.success(Done!)`, then the log message becomes "Done! (in 4 sec)" if showDuration=true.
   */
  showDuration?: boolean
}

interface LogConstructor<C extends BaseContext> extends Omit<LogConfig<C>, "key" | "timestamp"> {
  root: Logger
  parentConfigs: LogConfig<LogContext>[]
}

interface CreateLogParams
  extends Pick<LogConfig<LogContext>, "metadata" | "fixLevel" | "showDuration">,
    Pick<LogContext, "origin"> {}

interface CreateCoreLogParams
  extends Pick<LogConfig<CoreLogContext>, "metadata" | "fixLevel" | "showDuration">,
    Pick<CoreLogContext, "name" | "origin"> {
  name?: string
  origin?: string
}

export type Msg = string | (() => string)

export function resolveMsg(logEntry: LogEntry): string | undefined {
  return typeof logEntry.msg === "function" ? logEntry.msg() : logEntry.msg
}

export function transformMsg(msg: Msg, transformer: (input: string) => string): Msg {
  if (typeof msg === "function") {
    return () => transformer(msg())
  }
  return transformer(msg)
}

export interface LogEntry<C extends BaseContext = LogContext>
  extends Pick<LogConfig<C>, "key" | "timestamp" | "metadata" | "context"> {
  /**
   * The unique ID of the log context that created the log entry.
   */
  parentLogKey: string
  level: LogLevel
  /**
   * The actual text of the log message.
   */
  msg?: Msg
  /**
   * A "raw" version of the log line. This field is preferred over 'msg' if set when rendering
   * log entries in the dashboard.
   *
   * Use this if the entry has a msg that doesn't render well in the UI. In that case you
   * can set terminal log line via the 'msg' field and a web friendly version via this field.
   */
  rawMsg?: Msg
  /**
   * A symbol that's printed with the log message to indicate it's type (e.g. "error" or "success").
   */
  symbol?: LogSymbol
  data?: any
  dataFormat?: "json" | "yaml"
  error?: GardenError
  skipEmit?: boolean
}

interface LogParams
  extends Pick<LogEntry, "metadata" | "msg" | "rawMsg" | "symbol" | "data" | "dataFormat" | "error" | "skipEmit">,
    Pick<LogContext, "origin">,
    Pick<LogConfig<LogContext>, "showDuration"> {}

interface CreateLogEntryParams extends LogParams {
  level: LogLevel
}

/**
 * A helper function for creating instances of ActionLogs. That is, the log class required
 * by most actions.
 *
 * It differs from the "normal" CoreLog class in that it's context type is "ActionLogContext"
 * which includes the action name and action kind.
 */
export function createActionLog({
  log,
  actionName,
  actionKind,
  origin,
  fixLevel,
}: {
  log: Log
  actionName: string
  actionKind: string
  origin?: string
  fixLevel?: LogLevel
}) {
  return new ActionLog({
    parentConfigs: [...log.parentConfigs, log.getConfig()],
    metadata: log.metadata,
    root: log.root,
    fixLevel: fixLevel || log.fixLevel,
    context: {
      ...omitUndefined(log.context),
      type: "actionLog",
      origin,
      actionName,
      actionKind,
    },
  })
}

/**
 * The abstract log class which the CoreLog, ActionLog, and others extends.
 *
 * Contains all the methods the log classes use for writing logs at different levels
 * a long with a handful of helper methods.
 */
export abstract class Log<C extends BaseContext = LogContext> implements LogConfig<C> {
  public readonly showDuration?: boolean
  public readonly metadata?: LogMetadata
  public readonly key: string
  public readonly parentConfigs: LogConfig<LogContext>[]
  public readonly timestamp: string
  public readonly root: Logger
  public readonly fixLevel?: LogLevel
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
    this.context = params.context
    this.showDuration = params.showDuration || false
  }

  /**
   * Helper method for creating the actual log entry shape that gets passed to the root
   * logger for writing.
   */
  private createLogEntry(params: CreateLogEntryParams): LogEntry<C> {
    const level = this.fixLevel ? Math.max(this.fixLevel, params.level) : params.level

    let metadata: LogMetadata | undefined = undefined
    if (this.metadata || params.metadata) {
      metadata = { ...cloneDeep(this.metadata || {}), ...(params.metadata || {}) }
    }

    let msg = params.msg
    if (typeof msg === "function") {
      msg = memoize(msg)
    }

    return {
      ...params,
      parentLogKey: this.key,
      context: {
        ...this.context,
        origin: params.origin || this.context.origin,
      },
      level,
      timestamp: new Date().toISOString(),
      metadata,
      key: uniqid(),
      msg,
    }
  }

  /**
   * Helper method for creating the basic log config that gets passed down to child logs
   * when creating new log instances.
   */
  protected makeLogConfig(params: CreateLogParams) {
    return {
      metadata: params.metadata || this.metadata,
      fixLevel: params.fixLevel || this.fixLevel,
      showDuration: params.showDuration || false,
      context: {
        ...this.context,
        origin: params.origin || this.context.origin,
      },
      root: this.root,
      parentConfigs: [...this.parentConfigs, this.getConfig()],
    }
  }

  /**
   * Create a new log instance of the same type as the parent log.
   */
  abstract createLog(params?: CreateLogParams | CreateCoreLogParams): CoreLog | ActionLog

  private log(params: CreateLogEntryParams) {
    const entry = this.createLogEntry(params) as LogEntry
    if (this.root.storeEntries) {
      this.entries.push(entry)
    }
    this.root.log(entry)
    return this
  }

  /**
   * Append the duration to the log message if showDuration=true.
   *
   * That is, the time from when the log instance got created until now.
   */
  private getMsgWithDuration(params: CreateLogEntryParams) {
    // If params.showDuration is set, it takes precedence over this.duration (since it's set at the call site for the
    // log line in question).
    const showDuration = params.showDuration !== undefined ? params.showDuration : this.showDuration
    if (showDuration && params.msg) {
      const duration = this.getDuration(1)
      return transformMsg(params.msg, (msg) => {
        return `${msg} ${renderDuration(duration)}`
      })
    }

    return params.msg
  }

  private resolveCreateParams(level: LogLevel, params: string | (() => string) | LogParams): CreateLogEntryParams {
    if (typeof params === "string" || typeof params === "function") {
      return { msg: params, level }
    }
    return { ...params, level }
  }

  /**
   * Render a log entry at the silly level. This is the highest verbosity.
   */
  silly(params: Msg | LogParams) {
    return this.log(this.resolveCreateParams(LogLevel.silly, params))
  }

  /**
   * Render a log entry at the debug level. Intended for internal information
   * which can be useful for debugging.
   */
  debug(params: Msg | LogParams) {
    return this.log(this.resolveCreateParams(LogLevel.debug, params))
  }

  /**
   * Render a log entry at the verbose level. Intended for logs generated when
   * actions are executed. E.g. logs from Kubernetes.
   */
  verbose(params: Msg | LogParams) {
    return this.log(this.resolveCreateParams(LogLevel.verbose, params))
  }

  /**
   * Render a log entry at the info level. Intended for framework level logs
   * such as information about the action being executed.
   */
  info(params: Msg | (LogParams & { symbol?: Extract<LogSymbol, "info" | "empty" | "success"> })) {
    return this.log(this.resolveCreateParams(LogLevel.info, params))
  }

  /**
   * Render a log entry at the warning level.
   */
  warn(params: Msg | Omit<LogParams, "symbol">) {
    return this.log({
      ...this.resolveCreateParams(LogLevel.warn, params),
      symbol: "warning" as LogSymbol,
    })
  }

  /**
   * Render a log entry at the error level.
   * Appends the duration to the message if showDuration=true.
   */
  error(params: Msg | Omit<LogParams, "symbol">) {
    const resolved = {
      ...this.resolveCreateParams(LogLevel.error, params),
      symbol: "error" as LogSymbol,
    }

    return this.log({
      ...resolved,
      msg: this.getMsgWithDuration(resolved),
    })
  }

  /**
   * Render a log entry at the info level with "success" styling.
   * Appends the duration to the message if showDuration=true.
   *
   * TODO @eysi: This should really happen in the renderer and the parent log context
   * timestamp, the log entry timestamp, and showDuration should just be fields on the entry.
   */
  success(params: Msg | Omit<LogParams, "symbol">) {
    const resolved = {
      ...this.resolveCreateParams(LogLevel.info, params),
      symbol: "success" as LogSymbol,
    }

    const style = resolved.level === LogLevel.info ? styles.success : getStyle(resolved.level)
    return this.log({
      ...resolved,
      msg: transformMsg(this.getMsgWithDuration(resolved) || "", (msg) => (hasAnsi(msg) ? msg : style(msg))),
    })
  }

  getConfig(): LogConfig<C> {
    return {
      context: this.context,
      metadata: this.metadata,
      timestamp: this.timestamp,
      key: this.key,
      fixLevel: this.fixLevel,
    }
  }

  /**
   * Get the latest entry for this particular log context.
   */
  getLatestEntry() {
    return this.entries.slice(-1)[0]
  }

  /**
   * Get the log entries for this particular log context.
   */
  getLogEntries() {
    return this.entries
  }

  /**
   * Get all log entries, from this and other contexts, via the root logger.
   */
  getAllLogEntries() {
    return this.root.getLogEntries()
  }

  /**
   * Dumps log entries for this particular log context as a string, optionally filtering the entries with `filter`.
   * For example, to dump all the logs of level info or higher:
   *
   *   log.toString((entry) => entry.level <= LogLevel.info)
   */
  toString(filter?: (log: LogEntry) => boolean) {
    return this.getLogEntries()
      .filter((entry) => (filter ? filter(entry) : true))
      .map((entry) => resolveMsg(entry))
      .join("\n")
  }

  /**
   * Returns the duration in seconds, defaults to 2 decimal precision
   */
  getDuration(precision = 2): number {
    return round((new Date().getTime() - new Date(this.timestamp).getTime()) / 1000, precision)
  }

  toSanitizedValue() {
    // TODO: add a bit more info here
    return "<Log>"
  }
}

/**
 * This is the default log class and mostly used for log entries created before invoking
 * actions and plugins.
 *
 * The corresponding log context has a name which is used in the section part when printing log
 * lines.
 *
 * The log context can be overwritten when creating child logs.
 */
export class CoreLog extends Log<CoreLogContext> {
  /**
   * Create a new CoreLog instance, optionally overwriting the context.
   */
  createLog(params: CreateCoreLogParams = {}): CoreLog {
    return new CoreLog({
      ...this.makeLogConfig(params),
      context: {
        ...this.context,
        // Allow overwriting name
        name: params.name || this.context.name,
        // Allow overwriting origin
        origin: params.origin || this.context.origin,
      },
    })
  }
}

/**
 * The ActionLog class is used for log entries created by actions.
 *
 * The corresponding log context requires 'actionName' and 'actionKind' fields
 * which are used in the section part when printing log lines.
 *
 * The 'actionName' and 'actionKind' cannot be overwritten when creating child logs.
 */
export class ActionLog extends Log<ActionLogContext> {
  override showDuration = true

  /**
   * Create a new ActionLog instance. The new instance inherits the parent context.
   */
  createLog(params: CreateLogParams = {}): ActionLog {
    return new ActionLog(this.makeLogConfig(params))
  }
}
