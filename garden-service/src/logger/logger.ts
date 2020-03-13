/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { LogNode, CreateNodeParams } from "./log-node"
import { LogEntry } from "./log-entry"
import { getChildEntries, findLogNode } from "./util"
import { Writer } from "./writers/base"
import { InternalError, ParameterError } from "../exceptions"
import { LogLevel } from "./log-node"
import { BasicTerminalWriter } from "./writers/basic-terminal-writer"
import { FancyTerminalWriter } from "./writers/fancy-terminal-writer"
import { JsonTerminalWriter } from "./writers/json-terminal-writer"
import { parseLogLevel } from "../cli/helpers"

export type LoggerType = "quiet" | "basic" | "fancy" | "json"
export const LOGGER_TYPES = new Set<LoggerType>(["quiet", "basic", "fancy", "json"])

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

export interface LoggerConfig {
  level: LogLevel
  writers?: Writer[]
  useEmoji?: boolean
}

export class Logger extends LogNode {
  public writers: Writer[]
  public useEmoji: boolean

  private static instance: Logger

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

    // GARDEN_LOG_LEVEL env variable takes precedence over the config param
    if (process.env.GARDEN_LOG_LEVEL) {
      try {
        config.level = parseLogLevel(process.env.GARDEN_LOG_LEVEL)
      } catch (err) {
        // Log warning if level invalid but continue process.
        // Using console logger since Garden logger hasn't been intialised.
        console.warn("Warning:", err.message)
      }
    }

    // GARDEN_LOGGER_TYPE env variable takes precedence over the config param
    if (process.env.GARDEN_LOGGER_TYPE) {
      const loggerType = <LoggerType>process.env.GARDEN_LOGGER_TYPE

      if (!LOGGER_TYPES.has(loggerType)) {
        throw new ParameterError(`Invalid logger type specified: ${loggerType}`, {
          loggerType: process.env.GARDEN_LOGGER_TYPE,
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

  private constructor(config: LoggerConfig) {
    super(config.level)
    this.writers = config.writers || []
    this.useEmoji = config.useEmoji === false ? false : true
  }

  protected createNode(params: CreateNodeParams): LogEntry {
    return new LogEntry({ ...params, root: this })
  }

  placeholder(level: LogLevel = LogLevel.info): LogEntry {
    // Ensure placeholder child entries align with parent context
    return this.addNode({ level, indent: -1, isPlaceholder: true })
  }

  onGraphChange(entry: LogEntry) {
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
    return getChildEntries(this).filter((entry) => entry.getMessageState().section === section)
  }

  findById(id: string): LogEntry | void {
    return findLogNode(this, (node) => node.id === id)
  }

  stop(): void {
    this.getLogEntries().forEach((e) => e.stop())
    this.writers.forEach((writer) => writer.stop())
  }
}

export function getLogger() {
  return Logger.getInstance()
}
