/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Log, LogEntryMetadata, LogEntry, LogEntryParams } from "./log-entry"
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

export type LoggerType = "quiet" | "basic" | "json" | "ink"
export const LOGGER_TYPES = new Set<LoggerType>(["quiet", "basic", "json", "ink"])

export enum LogLevel {
  error = 0,
  warn = 1,
  info = 2,
  verbose = 3,
  debug = 4,
  silly = 5,
}

const getLogLevelNames = () => getEnumKeys(LogLevel)
const getNumericLogLevels = () => range(getLogLevelNames().length)
// Allow string or numeric log levels as CLI choices
export const getLogLevelChoices = () => [...getLogLevelNames(), ...getNumericLogLevels().map(String)]
export function parseLogLevel(level: string): LogLevel {
  let lvl: LogLevel
  const parsed = parseInt(level, 10)
  // Level is numeric
  if (parsed || parsed === 0) {
    lvl = parsed
    // Level is a string
  } else {
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

const eventLogLevel = LogLevel.debug

export function getWriterInstance(loggerType: LoggerType, level: LogLevel) {
  switch (loggerType) {
    case "basic":
      return new TerminalWriter({ level })
    case "json":
      return new JsonTerminalWriter({ level })
    case "ink":
      return new InkTerminalWriter({ level })
    case "quiet":
      return undefined
  }
}

export interface LogWriterConfigBase {
  level: LogLevel
  storeEntries?: boolean
  showTimestamps?: boolean
  useEmoji?: boolean
}

export interface LogWriterConfig extends LogWriterConfigBase {
  type: LoggerType
  storeEntries: boolean
}

export interface LogWriterConstructor extends LogWriterConfigBase {
  writers: Writer[]
  storeEntries: boolean
}

export interface CreateLogEntryParams extends LogEntryParams {
  level: LogLevel
}

export interface PlaceholderOpts {
  level?: number
  fixLevel?: boolean
  metadata?: LogEntryMetadata
}

export class Logger {
  public events: EventBus
  public useEmoji: boolean
  public showTimestamps: boolean
  public level: LogLevel
  public entries: LogEntry[]
  /**
   * Whether or not the log entries are stored in-memory on the logger instance. Useful for testing.
   */
  public storeEntries: boolean

  private writers: Writer[]
  private static instance?: Logger

  static getInstance() {
    if (!Logger.instance) {
      throw new InternalError("Logger not initialized", {})
    }
    return Logger.instance
  }

  /**
   * Initializes the logger as a singleton from config. Also ensures that the logger settings make sense
   * in the context of environment variables and writer types.
   */
  static initialize(config: LogWriterConfig): Logger {
    if (Logger.instance) {
      return Logger.instance
    }

    let instance: Logger

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

      config.type = loggerTypeFromEnv
    }

    const writer = getWriterInstance(config.type, config.level)

    instance = new Logger({ ...config, storeEntries: config.storeEntries, writers: writer ? [writer] : [] })

    const log = instance.makeNewLogContext()

    if (gardenEnv.GARDEN_LOG_LEVEL) {
      log.debug(`Setting log level to ${gardenEnv.GARDEN_LOG_LEVEL} (from GARDEN_LOG_LEVEL)`)
    }
    if (gardenEnv.GARDEN_LOGGER_TYPE) {
      log.debug(`Setting logger type to ${gardenEnv.GARDEN_LOGGER_TYPE} (from GARDEN_LOGGER_TYPE)`)
    }

    Logger.instance = instance
    return instance
  }

  /**
   * Clears the singleton instance. Use this if you need to re-initialise the global logger singleton.
   */
  static clearInstance() {
    Logger.instance = undefined
  }

  constructor(config: LogWriterConstructor) {
    this.level = config.level
    this.entries = []
    this.writers = config.writers || []
    this.useEmoji = config.useEmoji === false ? false : true
    this.showTimestamps = !!config.showTimestamps
    this.events = new EventBus()
    this.storeEntries = config.storeEntries
  }

  addWriter(writer: Writer) {
    this.writers.push(writer)
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
    for (const writer of this.writers) {
      if (entry.level <= writer.level) {
        writer.write(entry, this)
      }
    }
  }

  makeNewLogContext({
    level = LogLevel.info,
    metadata,
    fixLevel,
  }: {
    level?: LogLevel
    metadata?: LogEntryMetadata
    fixLevel?: boolean
  } = {}) {
    return new Log({
      level,
      fixLevel,
      metadata,
      root: this,
    })
  }

  getLogEntries(): LogEntry[] {
    if (!this.storeEntries) {
      throw new InternalError(`Cannot get entries when storeEntries=false`, {})
    }
    return this.entries
  }

  filterBySection(section: string): LogEntry[] {
    if (!this.storeEntries) {
      throw new InternalError(`Cannot filter entries when storeEntries=false`, {})
    }
    return this.entries.filter((entry) => entry.section === section)
  }

  findById(id: string): LogEntry | void {
    if (!this.storeEntries) {
      throw new InternalError(`Cannot find entry when storeEntries=false`, {})
    }
    return this.entries.find((entry) => entry.id === id)
  }

  stop(): void {
    this.writers.forEach((writer) => writer.stop())
  }

  cleanup(): void {
    this.writers.forEach((writer) => writer.cleanup())
  }
}

/**
 * Dummy Logger instance, just swallows log entries and prints nothing.
 */
export class VoidLogger extends Logger {
  constructor() {
    super({ writers: [], level: LogLevel.error, storeEntries: false })
  }
}

export function getLogger() {
  return Logger.getInstance()
}
