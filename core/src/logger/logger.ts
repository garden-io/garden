/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { LogMetadata, LogEntry, CoreLog } from "./log-entry"
import { Writer } from "./writers/base"
import { CommandError, InternalError, ParameterError } from "../exceptions"
import { TerminalWriter } from "./writers/terminal-writer"
import { JsonTerminalWriter } from "./writers/json-terminal-writer"
import { EventBus } from "../events"
import { formatLogEntryForEventStream } from "../cloud/buffered-event-stream"
import { gardenEnv } from "../constants"
import { getEnumKeys } from "../util/util"
import { range } from "lodash"
import { InkTerminalWriter } from "./writers/ink-terminal-writer"
import { QuietWriter } from "./writers/quiet-writer"
import { PluginEventBroker } from "../plugin-context"
import { EventLogWriter } from "./writers/event-writer"

export type LoggerType = "quiet" | "default" | "basic" | "json" | "ink"
export const LOGGER_TYPES = new Set<LoggerType>(["quiet", "default", "basic", "json", "ink"])

export enum LogLevel {
  error = 0,
  warn = 1,
  info = 2,
  verbose = 3,
  debug = 4,
  silly = 5,
}

export type StringLogLevel = keyof typeof LogLevel

const getLogLevelNames = () => getEnumKeys(LogLevel)
const getNumericLogLevels = () => range(getLogLevelNames().length)
// Allow string or numeric log levels as CLI choices
export const getLogLevelChoices = () => [...getLogLevelNames(), ...getNumericLogLevels().map(String)]

export function parseLogLevel(level: string): LogLevel {
  let lvl: LogLevel
  const parsed = parseInt(level, 10)
  if (parsed || parsed === 0) {
    // Level is numeric
    lvl = parsed
  } else {
    // Level is a string
    lvl = LogLevel[level]
  }
  if (!getNumericLogLevels().includes(lvl)) {
    throw new InternalError(
      `Unexpected log level, expected one of ${getLogLevelChoices().join(", ")}, got ${level}`,
      {}
    )
  }
  return lvl
}

export const logLevelMap = {
  [LogLevel.error]: "error",
  [LogLevel.warn]: "warn",
  [LogLevel.info]: "info",
  [LogLevel.verbose]: "verbose",
  [LogLevel.debug]: "debug",
  [LogLevel.silly]: "silly",
}

export function logLevelToString(level: LogLevel): StringLogLevel {
  return logLevelMap[level] as StringLogLevel
}

const eventLogLevel = LogLevel.debug

/**
 * Return the logger type, depending on what command line args have been set
 * and whether the commnad specifies a logger type.
 */
export function getTerminalWriterType({
  silent,
  output,
  loggerTypeOpt,
  commandLoggerType,
}: {
  silent: boolean
  output: boolean
  loggerTypeOpt: LoggerType | null
  commandLoggerType: LoggerType | null
}) {
  if (silent || output) {
    return "quiet"
  }
  return loggerTypeOpt || commandLoggerType || "default"
}

export function getTerminalWriterInstance(loggerType: LoggerType, level: LogLevel): Writer {
  switch (loggerType) {
    case "default":
    case "basic":
      return new TerminalWriter({ level })
    case "json":
      return new JsonTerminalWriter({ level })
    case "ink":
      return new InkTerminalWriter({ level })
    case "quiet":
      return new QuietWriter({ level })
  }
}

interface LoggerConfigBase {
  /**
   * The Garden log level. This get propagated to the actual writers which have their own
   * levels which may in some cases overwrite this.
   */
  level: LogLevel
  /**
   * Whether or not the log entries are stored in-memory on the logger instance. Useful for testing.
   */
  storeEntries?: boolean
  showTimestamps?: boolean
  useEmoji?: boolean
}

interface CreateLogParams {
  metadata?: LogMetadata
  fixLevel?: LogLevel
  /**
   * The name of the log context. Will be printed as the "section" part of the log lines
   * belonging to this context.
   */
  name?: string
}

interface LoggerWriters {
  display: Writer
  file: Writer[]
}

export interface Logger extends Required<LoggerConfigBase> {
  events: EventBus
  createLog(params?: CreateLogParams): CoreLog
  log(entry: LogEntry): void
  getLogEntries(): LogEntry[]
  getWriters(): LoggerWriters
}

interface LoggerInitParams extends LoggerConfigBase {
  /**
   * The type of display writer to use. This is configurable by the user
   * and exposed as a "logger type" which is a bit more user friendly.
   *
   * The logger also has a set of file writers that are set internally.
   */
  displayWriterType: LoggerType
  force?: boolean
}

export abstract class LoggerBase implements Logger {
  public events: EventBus
  public useEmoji: boolean
  public showTimestamps: boolean
  public level: LogLevel
  public entries: LogEntry[]
  public storeEntries: boolean

  protected writers: LoggerWriters

  constructor(config: LoggerConfigBase) {
    this.level = config.level
    this.entries = []
    this.useEmoji = config.useEmoji === false ? false : true
    this.showTimestamps = !!config.showTimestamps
    this.events = new EventBus()
    this.storeEntries = config.storeEntries || false
  }

  toSanitizedValue() {
    return "<Logger>"
  }

  getWriters() {
    return this.writers
  }

  log(entry: LogEntry) {
    if (this.storeEntries) {
      this.entries.push(entry)
    }
    if (entry.level <= eventLogLevel) {
      this.events.emit("logEntry", formatLogEntryForEventStream(entry))
    }
    const writers = [this.writers.display, ...this.writers.file]
    for (const writer of writers) {
      if (entry.level <= writer.level) {
        writer.write(entry, this)
      }
    }
  }

  /**
   * Creates a new CoreLog context from the root Logger.
   */
  createLog({ metadata, fixLevel, name }: CreateLogParams = {}) {
    return new CoreLog({
      parentConfigs: [],
      fixLevel,
      metadata,
      context: {
        name,
      },
      root: this,
    })
  }

  /**
   * Returns all log entries. Throws if storeEntries=false
   *
   * @throws(InternalError)
   */
  getLogEntries(): LogEntry[] {
    if (!this.storeEntries) {
      throw new InternalError(`Cannot get entries when storeEntries=false`, {})
    }
    return this.entries
  }
}

interface RootLoggerParams extends LoggerConfigBase {
  writers: LoggerWriters
}

/**
 * The "root" Logger. Responsible for calling the log writers on log events
 * and holds the command-wide log configuration.
 *
 * Is initialized as a singleton class.
 *
 * Note that this class does not have methods for logging at different levels. Rather
 * that's handled by the 'Log' class which in turns calls the root Logger.
 */
export class RootLogger extends LoggerBase {
  private static instance?: RootLogger

  private constructor(config: RootLoggerParams) {
    super(config)
    this.writers = config.writers
  }

  /**
   * Returns the already initialized Logger singleton instance.
   *
   * Throws and error if called before logger is initialized.
   *
   * @throws(InternalError)
   */
  static getInstance() {
    if (!RootLogger.instance) {
      throw new InternalError("Logger not initialized", {})
    }
    return RootLogger.instance
  }

  /**
   * Initializes the logger as a singleton from config. Also ensures that the logger settings make sense
   * in the context of environment variables and writer types.
   */
  static initialize(config: LoggerInitParams): RootLogger {
    if (RootLogger.instance) {
      return RootLogger.instance
    }

    let instance: RootLogger

    // The GARDEN_LOG_LEVEL env variable takes precedence over the config param
    if (gardenEnv.GARDEN_LOG_LEVEL) {
      try {
        config.level = parseLogLevel(gardenEnv.GARDEN_LOG_LEVEL)
      } catch (err) {
        throw new CommandError(`Invalid log level set for GARDEN_LOG_LEVEL: ${err.message}`, {})
      }
    }

    // GARDEN_LOGGER_TYPE env variable takes precedence over the config param
    if (gardenEnv.GARDEN_LOGGER_TYPE) {
      const loggerTypeFromEnv = <LoggerType>gardenEnv.GARDEN_LOGGER_TYPE

      if (!LOGGER_TYPES.has(loggerTypeFromEnv)) {
        throw new ParameterError(`Invalid logger type specified: ${loggerTypeFromEnv}`, {
          loggerType: gardenEnv.GARDEN_LOGGER_TYPE,
          availableTypes: LOGGER_TYPES,
        })
      }

      config.displayWriterType = loggerTypeFromEnv
    }

    const terminalWriter = getTerminalWriterInstance(config.displayWriterType, config.level)
    const writers = {
      display: terminalWriter,
      file: [],
    }

    instance = new RootLogger({ ...config, storeEntries: config.storeEntries, writers })

    const initLog = instance.createLog()

    if (gardenEnv.GARDEN_LOG_LEVEL) {
      initLog.debug(`Setting log level to ${gardenEnv.GARDEN_LOG_LEVEL} (from GARDEN_LOG_LEVEL)`)
    }
    if (gardenEnv.GARDEN_LOGGER_TYPE) {
      initLog.debug(`Setting logger type to ${gardenEnv.GARDEN_LOGGER_TYPE} (from GARDEN_LOGGER_TYPE)`)
    }

    RootLogger.instance = instance
    return instance
  }

  /**
   * Clears the singleton instance. Use this if you need to re-initialise the global logger singleton.
   */
  static clearInstance() {
    RootLogger.instance = undefined
  }

  addFileWriter(writer: Writer) {
    this.writers.file.push(writer)
  }

  /**
   * Reset the default terminal writer that the logger was initialized with.
   *
   * This is required because when we initialize the logger we don't know what writer
   * the command may require and we need to re-set it when we've resolved the command.
   */
  setTerminalWriter(type: LoggerType) {
    this.writers.display = getTerminalWriterInstance(type, this.level)
  }

  /**
   * WARNING: Only use for tests.
   *
   * The logger is a singleton which makes it hard to test. This is an escape hatch.
   */
  static _createInstanceForTests(params: RootLoggerParams) {
    return new RootLogger(params)
  }
}

export function getRootLogger() {
  return RootLogger.getInstance()
}

interface EventLoggerParams extends LoggerConfigBase {
  defaultOrigin?: string
  events: PluginEventBroker // TODO: may want to support other event buses
}

export interface CreateEventLogParams extends CreateLogParams {
  origin: string
}

export class EventLogger extends LoggerBase {
  constructor(config: EventLoggerParams) {
    super(config)
    this.writers = {
      display: new EventLogWriter({ level: config.level, defaultOrigin: config.defaultOrigin, events: config.events }),
      file: [],
    }
  }

  /**
   * Creates a new CoreLog context from the root Logger.
   */
  createLog(params: CreateEventLogParams) {
    return super.createLog(params)
  }
}
