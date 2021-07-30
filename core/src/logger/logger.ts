/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { LogEntry, LogEntryMetadata, LogEntryParams } from "./log-entry"
import { getChildEntries, findLogEntry } from "./util"
import { Writer } from "./writers/base"
import { CommandError, InternalError, ParameterError } from "../exceptions"
import { BasicTerminalWriter } from "./writers/basic-terminal-writer"
import { FancyTerminalWriter } from "./writers/fancy-terminal-writer"
import { JsonTerminalWriter } from "./writers/json-terminal-writer"
import { EventBus } from "../events"
import { formatLogEntryForEventStream } from "../cloud/buffered-event-stream"
import { gardenEnv } from "../constants"
import { getEnumKeys } from "../util/util"
import { range } from "lodash"

export type LoggerType = "quiet" | "basic" | "fancy" | "json"
export const LOGGER_TYPES = new Set<LoggerType>(["quiet", "basic", "fancy", "json"])

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
      return new BasicTerminalWriter(level)
    case "fancy":
      return new FancyTerminalWriter(level)
    case "json":
      return new JsonTerminalWriter(level)
    case "quiet":
      return undefined
  }
}

export interface LoggerConfigBase {
  level: LogLevel
  storeEntries?: boolean
  showTimestamps?: boolean
  useEmoji?: boolean
}

export interface LoggerConfig extends LoggerConfigBase {
  type: LoggerType
  storeEntries: boolean
}

export interface LoggerConstructor extends LoggerConfigBase {
  writers: Writer[]
  storeEntries: boolean
}

export interface CreateNodeParams extends LogEntryParams {
  level: LogLevel
  isPlaceholder?: boolean
}

export interface PlaceholderOpts {
  level?: number
  childEntriesInheritLevel?: boolean
  indent?: number
  metadata?: LogEntryMetadata
}

export interface LogNode {
  silly(params: string | LogEntryParams): LogEntry
  debug(params: string | LogEntryParams): LogEntry
  verbose(params: string | LogEntryParams): LogEntry
  info(params: string | LogEntryParams): LogEntry
  warn(params: string | LogEntryParams): LogEntry
  error(params: string | LogEntryParams): LogEntry
}

function resolveParams(level: LogLevel, params: string | LogEntryParams): CreateNodeParams {
  if (typeof params === "string") {
    return { msg: params, level }
  }
  return { ...params, level }
}

export class Logger implements LogNode {
  public events: EventBus
  public useEmoji: boolean
  public showTimestamps: boolean
  public level: LogLevel
  public children: LogEntry[]
  /**
   * Whether or not the log entries are stored in-memory on the logger instance.
   * Defaults to false except when the FancyWriter is used, in which case storing the entries
   * is required. Otherwise useful for testing.
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
  static initialize(config: LoggerConfig): Logger {
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

    // The fancy logger doesn't play well with high log levels and/or timestamps
    // so we enforce that the type is set to basic.
    if (config.type === "fancy" && (config.level > LogLevel.info || config.showTimestamps)) {
      config.type = "basic"
    }

    const writer = getWriterInstance(config.type, config.level)

    instance = new Logger({ ...config, storeEntries: config.storeEntries, writers: writer ? [writer] : [] })

    if (gardenEnv.GARDEN_LOG_LEVEL) {
      instance.debug(`Setting log level to ${gardenEnv.GARDEN_LOG_LEVEL} (from GARDEN_LOG_LEVEL)`)
    }
    if (gardenEnv.GARDEN_LOGGER_TYPE) {
      instance.debug(`Setting logger type to ${gardenEnv.GARDEN_LOGGER_TYPE} (from GARDEN_LOGGER_TYPE)`)
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

  constructor(config: LoggerConstructor) {
    this.level = config.level
    this.children = []
    this.writers = config.writers || []
    this.useEmoji = config.useEmoji === false ? false : true
    this.showTimestamps = !!config.showTimestamps
    this.events = new EventBus()
    this.storeEntries = config.storeEntries
  }

  private addNode(params: CreateNodeParams): LogEntry {
    const entry = new LogEntry({ ...params, root: this })
    if (this.storeEntries) {
      this.children.push(entry)
    }
    this.onGraphChange(entry)
    return entry
  }

  addWriter(writer: Writer) {
    this.writers.push(writer)
  }

  getWriters() {
    return this.writers
  }

  onGraphChange(entry: LogEntry) {
    if (entry.level <= eventLogLevel && !entry.isPlaceholder) {
      this.events.emit("logEntry", formatLogEntryForEventStream(entry))
    }
    for (const writer of this.writers) {
      if (entry.level <= writer.level) {
        writer.onGraphChange(entry, this)
      }
    }
  }

  silly(params: string | LogEntryParams): LogEntry {
    return this.addNode(resolveParams(LogLevel.silly, params))
  }

  debug(params: string | LogEntryParams): LogEntry {
    return this.addNode(resolveParams(LogLevel.debug, params))
  }

  verbose(params: string | LogEntryParams): LogEntry {
    return this.addNode(resolveParams(LogLevel.verbose, params))
  }

  info(params: string | LogEntryParams): LogEntry {
    return this.addNode(resolveParams(LogLevel.info, params))
  }

  warn(params: string | LogEntryParams): LogEntry {
    return this.addNode(resolveParams(LogLevel.warn, params))
  }

  error(params: string | LogEntryParams): LogEntry {
    return this.addNode(resolveParams(LogLevel.error, params))
  }

  placeholder({ level = LogLevel.info, indent, metadata }: PlaceholderOpts = {}): LogEntry {
    // Ensure placeholder child entries align with parent context
    return this.addNode({ level, indent: indent || -1, isPlaceholder: true, metadata })
  }

  getLogEntries(): LogEntry[] {
    if (!this.storeEntries) {
      throw new InternalError(`Cannot get entries when storeEntries=false`, {})
    }
    return getChildEntries(this).filter((entry) => !entry.fromStdStream)
  }

  filterBySection(section: string): LogEntry[] {
    if (!this.storeEntries) {
      throw new InternalError(`Cannot filter entries when storeEntries=false`, {})
    }
    return getChildEntries(this).filter((entry) => entry.getLatestMessage().section === section)
  }

  findById(id: string): LogEntry | void {
    if (!this.storeEntries) {
      throw new InternalError(`Cannot find entry when storeEntries=false`, {})
    }
    return findLogEntry(this, (node) => node.id === id)
  }

  stop(): void {
    if (this.storeEntries) {
      this.getLogEntries().forEach((e) => e.stop())
    }
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
