/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as nodeEmoji from "node-emoji"
import chalk from "chalk"

import { RootLogNode, LogNode } from "./log-node"
import { LogEntry, CreateOpts, resolveParam } from "./log-entry"
import { getChildEntries } from "./util"
import { Writer } from "./writers/base"
import { InternalError, ParameterError } from "../exceptions"
import { LogLevel } from "./log-node"
import { FancyTerminalWriter } from "./writers/fancy-terminal-writer"
import { BasicTerminalWriter } from "./writers/basic-terminal-writer"
import { combine } from "./renderers"

export enum LoggerType {
  quiet = "quiet",
  basic = "basic",
  fancy = "fancy",
}

export function getCommonConfig(loggerType: LoggerType): LoggerConfig {
  const configs: { [key in LoggerType]: LoggerConfig } = {
    [LoggerType.fancy]: {
      level: LogLevel.info,
      writers: [new FancyTerminalWriter()],
    },
    [LoggerType.basic]: {
      level: LogLevel.info,
      writers: [new BasicTerminalWriter()],
    },
    [LoggerType.quiet]: {
      level: LogLevel.info,
    },
  }
  return configs[loggerType]
}

export interface LoggerConfig {
  level: LogLevel
  writers?: Writer[]
}

export class Logger extends RootLogNode<LogEntry> {
  public writers: Writer[]

  private static instance: Logger

  static getInstance() {
    if (!Logger.instance) {
      throw new InternalError("Logger not initialized", {})
    }
    return Logger.instance
  }

  static initialize(config: LoggerConfig) {
    if (Logger.instance) {
      throw new InternalError("Logger already initialized", {})
    }

    let instance

    // If GARDEN_LOGGER_TYPE env variable is set it takes precedence over the config param
    if (process.env.GARDEN_LOGGER_TYPE) {
      const loggerType = LoggerType[process.env.GARDEN_LOGGER_TYPE]

      if (!loggerType) {
        throw new ParameterError(`Invalid logger type specified: ${process.env.GARDEN_LOGGER_TYPE}`, {
          loggerType: process.env.GARDEN_LOGGER_TYPE,
          availableTypes: Object.keys(LoggerType),
        })
      }

      instance = new Logger(getCommonConfig(loggerType))
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
  }

  createNode(level: LogLevel, _parent: LogNode, opts: CreateOpts) {
    return new LogEntry({ level, parent: this, opts: resolveParam(opts) })
  }

  onGraphChange(entry: LogEntry) {
    this.writers.forEach(writer => writer.onGraphChange(entry, this))
  }

  getLogEntries(): LogEntry[] {
    return getChildEntries(this).filter(entry => !entry.fromStdStream())
  }

  filterBySection(section: string): LogEntry[] {
    return getChildEntries(this).filter(entry => entry.opts.section === section)
  }

  header(
    { command, emoji, level = LogLevel.info }: { command: string, emoji?: string, level?: LogLevel },
  ): LogEntry {
    const msg = combine([
      [chalk.bold.magenta(command)],
      [emoji ? " " + nodeEmoji.get(emoji) : ""],
      ["\n"],
    ])
    const lvlStr = LogLevel[level]
    return this[lvlStr](msg)
  }

  finish(
    { showDuration = true, level = LogLevel.info }: { showDuration?: boolean, level?: LogLevel } = {},
  ): LogEntry {
    const msg = combine([
      [`\n${nodeEmoji.get("sparkles")}  Finished`],
      [showDuration ? ` in ${chalk.bold(this.getDuration() + "s")}` : "!"],
      ["\n"],
    ])
    const lvlStr = LogLevel[level]
    return this[lvlStr](msg)
  }

  stop(): void {
    this.getLogEntries().forEach(e => e.stop())
    this.writers.forEach(writer => writer.stop())
  }

}

export function getLogger() {
  return Logger.getInstance()
}
