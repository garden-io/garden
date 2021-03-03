/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { LogNode, CreateNodeParams, PlaceholderOpts } from "./log-node"
import { LogEntry, EVENT_LOG_LEVEL } from "./log-entry"
import { getChildEntries, findLogNode } from "./util"
import { Writer } from "./writers/base"
import { InternalError, ParameterError } from "../exceptions"
import { LogLevel } from "./log-node"
import { BasicTerminalWriter } from "./writers/basic-terminal-writer"
import { FancyTerminalWriter } from "./writers/fancy-terminal-writer"
import { JsonTerminalWriter } from "./writers/json-terminal-writer"
import { FullscreenTerminalWriter } from "./writers/fullscreen-terminal-writer"
import { EventBus } from "../events"
import { formatLogEntryForEventStream } from "../enterprise/buffered-event-stream"
import { gardenEnv } from "../constants"
import { getEnumKeys } from "../util/util"
import { range } from "lodash"

export type LoggerType = "quiet" | "basic" | "fancy" | "fullscreen" | "json"
export const LOGGER_TYPES = new Set<LoggerType>(["quiet", "basic", "fancy", "fullscreen", "json"])

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

// Add platforms/terminals?
export function envSupportsEmoji() {
  return (
    process.platform === "darwin" || process.env.TERM_PROGRAM === "Hyper" || process.env.TERM_PROGRAM === "HyperTerm"
  )
}

export function getWriterInstance(loggerType: LoggerType, level: LogLevel) {
  switch (loggerType) {
    case "basic":
      return new BasicTerminalWriter(level)
    case "fancy":
      return new FancyTerminalWriter(level)
    case "fullscreen":
      return new FullscreenTerminalWriter(level)
    case "json":
      return new JsonTerminalWriter(level)
    case "quiet":
      return undefined
  }
}

export interface LoggerConfig {
  level: LogLevel
  showTimestamps?: boolean
  writers?: Writer[]
  useEmoji?: boolean
}

export class Logger extends LogNode {
  public writers: Writer[]
  public events: EventBus
  public useEmoji: boolean
  public showTimestamps: boolean

  private static instance?: Logger

  static getInstance() {
    if (!Logger.instance) {
      throw new InternalError("Logger not initialized", {})
    }
    return Logger.instance
  }

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
        // Log warning if level invalid but continue process.
        // Using console logger since Garden logger hasn't been intialised.
        console.warn("Warning:", err.message)
      }
    }

    // GARDEN_LOGGER_TYPE env variable takes precedence over the config param
    if (gardenEnv.GARDEN_LOGGER_TYPE) {
      const loggerType = <LoggerType>gardenEnv.GARDEN_LOGGER_TYPE

      if (!LOGGER_TYPES.has(loggerType)) {
        throw new ParameterError(`Invalid logger type specified: ${loggerType}`, {
          loggerType: gardenEnv.GARDEN_LOGGER_TYPE,
          availableTypes: LOGGER_TYPES,
        })
      }

      const writer = getWriterInstance(loggerType, config.level)
      instance = new Logger({
        writers: writer ? [writer] : undefined,
        level: config.level,
      })
      instance.debug(`Setting logger type to ${loggerType} (from GARDEN_LOGGER_TYPE)`)
    } else {
      instance = new Logger(config)
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

  constructor(config: LoggerConfig) {
    super(config.level)
    this.writers = config.writers || []
    this.useEmoji = config.useEmoji === false ? false : true
    this.showTimestamps = !!config.showTimestamps
    this.events = new EventBus()
  }

  protected createNode(params: CreateNodeParams): LogEntry {
    return new LogEntry({ ...params, root: this })
  }

  placeholder({ level = LogLevel.info, indent, metadata }: PlaceholderOpts = {}): LogEntry {
    // Ensure placeholder child entries align with parent context
    return this.addNode({ level, indent: indent || -1, isPlaceholder: true, metadata })
  }

  onGraphChange(entry: LogEntry) {
    if (entry.level <= EVENT_LOG_LEVEL && !entry.isPlaceholder) {
      this.events.emit("logEntry", formatLogEntryForEventStream(entry))
    }
    for (const writer of this.writers) {
      if (entry.level <= writer.level) {
        writer.onGraphChange(entry, this)
      }
    }
  }

  getLogEntries(): LogEntry[] {
    return getChildEntries(this).filter((entry) => !entry.fromStdStream)
  }

  filterBySection(section: string): LogEntry[] {
    return getChildEntries(this).filter((entry) => entry.getLatestMessage().section === section)
  }

  findById(id: string): LogEntry | void {
    return findLogNode(this, (node) => node.id === id)
  }

  stop(): void {
    this.getLogEntries().forEach((e) => e.stop())
    this.writers.forEach((writer) => writer.stop())
  }

  cleanup(): void {
    this.writers.forEach((writer) => writer.cleanup())
  }
}

export function getLogger() {
  return Logger.getInstance()
}
