/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { LogMetadata, LogEntry, CoreLogContext } from "./log-entry.js"
import { CoreLog } from "./log-entry.js"
import type { Writer } from "./writers/base.js"
import { CommandError, ParameterError, InternalError } from "../exceptions.js"
import { TerminalWriter } from "./writers/terminal-writer.js"
import { JsonTerminalWriter } from "./writers/json-terminal-writer.js"
import { EventBus } from "../events/events.js"
import { formatLogEntryForEventStream } from "../cloud/restful-event-stream.js"
import { gardenEnv } from "../constants.js"
import { getEnumKeys } from "../util/util.js"
import { range } from "lodash-es"
import { InkTerminalWriter } from "./writers/ink-terminal-writer.js"
import { QuietWriter } from "./writers/quiet-writer.js"
import type { PluginEventBroker } from "../plugin-context.js"
import { EventLogWriter } from "./writers/event-writer.js"
import { naturalList } from "../util/string.js"
import type { OutputRenderer } from "../cli/params.js"

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
    // This should be validated on a different level
    throw new ParameterError({
      message: `Unexpected log level, expected one of ${getLogLevelChoices().join(", ")}, got ${level}`,
    })
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

export const eventLogLevel = LogLevel.debug

/**
 * Return the logger type, depending on what command line args are used.
 */
export function getTerminalWriterType({
  silent,
  output,
  loggerType,
}: {
  silent: boolean
  output: boolean
  loggerType: LoggerType | null
}) {
  if (silent || output) {
    return "quiet"
  }
  return loggerType || "default"
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

export interface LoggerConfigBase {
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

export interface LoggerInitParams extends LoggerConfigBase {
  /**
   * The type of display writer to use. This is configurable by the user
   * and exposed as a "logger type" which is a bit more user friendly.
   *
   * The logger also has a set of file writers that are set internally.
   */
  displayWriterType: LoggerType
  /**
   * The output renderer to use. This is intended to produce machine-readable/parse-able output (e.g. JSON or YAML) for
   * the Garden command. When a this option is used, this essentially suppresses all line-by-line log output, except
   * for the serialized command result at the end of the command.
   *
   * This is because non JSON/YAML log lines would make the command's output not a valid JSON/YAML string, and thus
   * break any parsing logic that expects the output of the Garden to be aalid JSON/YAML.
   */
  outputRenderer?: OutputRenderer
  force?: boolean
}

/**
 * What follows is a fairly lengthy code comment on how logging in Garden works. As such it's
 * liable to go out of date so don't hesitate to update this if you see anything wrong.
 *
 * ---
 *
 * There's a singleton "root" Logger instance which is the overall logs manager. It holds the "global"
 * log config for the given Garden run, including  what writers are used. When a log line is written,
 * the root Logger calls the registered writers and optionally stores the entry in memory which is useful for testing.
 *
 * The writers in turn call the renderers which are just helper functions for printing log lines
 * for different contexts.
 *
 * The root Logger also creates the first Log instance which is what we pass around for writing
 * logs.
 *
 * The Log instance itself contains the methods for writing logs (log.info, log.silly, etc)
 * as well as some config and context that gets passed to the log entry proper.
 *
 * The Log instances are therefore responsible for holding log config for multiple entries
 * over some period of execution.
 *
 * That is:
 *   - Consumer calls log.info() which creates a log entry which inherits the log's context.
 *   - The log then calls the root logger with the entry which calls the writers which render the entry.
 *
 * There are different Log classes, e.g. CoreLog and ActionLog which is to ensure a given log entry
 * has the correct context in a type safe manner.
 *
 * Usage example:
 *
 * const firstLog = rootLogger.createLog({ name: "garden" }) // You could also do 'new CoreLog({ root })', createLog is just for convenience
 * firstLog.info("Getting started...") // Prints: ℹ garden → Getting started...
 *
 * const graphLog = firstLog.createLog({ name: "graph" }) // Again you can also do 'new CoreLog({ ... })'
 * graphLog.info("Resolving actions") // ℹ graph → Resolving actions...
 *
 * actionLog = new ActionLog({ actionName: "api", actionKind: "build" })
 * actionLog.info("hello") // ℹ build.api → hello
 *
 * Some invariants:
 *   You can't overwrite the action name and action kind for an ActionLog.
 *   You can overwrite the name of a CoreLog.
 *
 * Other notes:
 *   - The Log instances may apply some styling depending on the context. In general you should
 *     not have to overwrite this and simply default to calling e.g. log.warn("oh noes")
 *     as opposed to log.warn({ msg: styles.warning("oh noes"), symbol: "warning" })
 *   - A Log instance contains all it's parent Log configs so conceptually we can rebuild
 *     the entire log graph, e.g. for testing. We're not using this as of writing.
 */
export abstract class LoggerBase implements Logger {
  public events: EventBus
  public useEmoji: boolean
  public showTimestamps: boolean
  public level: LogLevel
  public entries: LogEntry[]
  public storeEntries: boolean

  protected abstract writers: LoggerWriters

  constructor(config: LoggerConfigBase) {
    this.level = config.level
    this.entries = []
    this.useEmoji = config.useEmoji !== false
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
    // FIXME @eysi: We're storing entries on the roots and each individual log instance
    // so basically duplicating them. Not a big deal since it's only used for testing atm.
    if (this.storeEntries) {
      this.entries.push(entry)
    }
    if (entry.level <= eventLogLevel && !entry.skipEmit) {
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
  createLog({
    metadata,
    fixLevel,
    name,
    origin,
    context,
  }: {
    metadata?: LogMetadata
    fixLevel?: LogLevel
    /**
     * The name of the log context. Will be printed as the "section" part of the log lines
     * belonging to this context.
     */
    name?: string
    origin?: string
    context?: Partial<CoreLogContext>
  } = {}): CoreLog {
    return new CoreLog({
      parentConfigs: [],
      fixLevel,
      metadata,
      context: {
        name,
        origin,
        ...context,
        type: "coreLog",
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
      throw new InternalError({ message: `Cannot get entries when storeEntries=false` })
    }
    return this.entries
  }

  /**
   * Returns latest log entry. Throws if storeEntries=false
   *
   * @throws(InternalError)
   */
  getLatestEntry() {
    if (!this.storeEntries) {
      throw new InternalError({ message: `Cannot get entries when storeEntries=false` })
    }
    return this.entries.slice(-1)[0]
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
  protected override writers: LoggerWriters

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
      throw new InternalError({ message: "Logger not initialized" })
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

    const updatedConfig = RootLogger.applyEnvToLoggerConfig(config)

    const terminalWriter = getTerminalWriterInstance(updatedConfig.displayWriterType, updatedConfig.level)
    const writers = {
      display: terminalWriter,
      file: [],
    }

    const instance = new RootLogger({ ...updatedConfig, storeEntries: updatedConfig.storeEntries, writers })
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

  static applyEnvToLoggerConfig(config: LoggerInitParams) {
    // Make a shallow copy instead of mutating the param.
    const updated = { ...config }
    // The GARDEN_LOG_LEVEL env variable takes precedence over the config param
    if (gardenEnv.GARDEN_LOG_LEVEL) {
      try {
        updated.level = parseLogLevel(gardenEnv.GARDEN_LOG_LEVEL)
      } catch (err) {
        if (!(err instanceof ParameterError)) {
          throw err
        }
        throw new CommandError({ message: `Invalid log level set for GARDEN_LOG_LEVEL: ${err.message}` })
      }
    }

    // GARDEN_LOGGER_TYPE env variable takes precedence over the updated param, unless the `--output` option is used.
    if (gardenEnv.GARDEN_LOGGER_TYPE && !updated.outputRenderer) {
      const loggerTypeFromEnv = <LoggerType>gardenEnv.GARDEN_LOGGER_TYPE

      if (!LOGGER_TYPES.has(loggerTypeFromEnv)) {
        throw new ParameterError({
          message: `Invalid logger type specified: ${loggerTypeFromEnv}. Available types: ${naturalList(
            Array.from(LOGGER_TYPES)
          )}`,
        })
      }

      updated.displayWriterType = loggerTypeFromEnv
    }
    return updated
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

interface ServerLoggerParams extends LoggerConfigBase {
  defaultOrigin?: string
  rootLogger: Logger
  terminalLevel?: LogLevel
}

export interface CreateEventLogParams extends CreateLogParams {
  origin: string
}

/**
 * A Logger class for handling server requests.
 *
 * It writes entries to stdout at the silly level via the "main" root logger for the respective
 * Garden instance but emits log entry events at their regular level. This basically ensures
 * command logs for server requests are emitted but do not pollute the terminal.
 */
export class ServerLogger extends LoggerBase {
  // These aren't actually used,
  // but need to be defined since they're abstract in the base class
  protected override writers: LoggerWriters = {
    display: new QuietWriter(),
    file: [new QuietWriter()],
  }

  private rootLogger: Logger
  /**
   * The log level to use for terminal output. Defaults to silly.
   */
  private terminalLevel: LogLevel

  constructor(config: ServerLoggerParams) {
    super(config)
    this.rootLogger = config.rootLogger
    this.terminalLevel = config.terminalLevel || LogLevel.silly
  }

  override log(entry: LogEntry) {
    this.rootLogger.log({ ...entry, level: this.terminalLevel })

    if (entry.level <= eventLogLevel && !entry.skipEmit) {
      this.rootLogger.events.emit("logEntry", formatLogEntryForEventStream(entry))
    }
  }
}

export class VoidLogger extends LoggerBase {
  protected override writers: LoggerWriters = {
    display: new QuietWriter(),
    file: [new QuietWriter()],
  }

  override log() {
    // No op
  }
}

export class EventLogger extends LoggerBase {
  protected override writers: LoggerWriters

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
  override createLog(params: CreateEventLogParams) {
    return super.createLog(params)
  }
}
