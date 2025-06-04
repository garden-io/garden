/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import winston from "winston"
import { dirname, isAbsolute } from "path"
import fsExtra from "fs-extra"
const { ensureDir, truncate } = fsExtra
import stripAnsi from "strip-ansi"

import { LogLevel } from "../logger.js"
import type { LogEntry } from "../log-entry.js"
import type { BaseWriterParams } from "./base.js"
import { Writer } from "./base.js"
import { renderError, renderMsg } from "../renderers.js"
import { InternalError } from "../../exceptions.js"

export interface FileWriterConfig extends BaseWriterParams {
  level: LogLevel
  logFilePath: string
  fileTransportOptions?: {}
  json?: boolean
  truncatePrevious?: boolean
}

type FileTransportOptions = winston.transports.FileTransportOptions

const { combine: winstonCombine, timestamp, printf } = winston.format

const DEFAULT_FILE_TRANSPORT_OPTIONS: FileTransportOptions = {
  format: winstonCombine(
    timestamp(),
    printf((info) => `\n[${info.timestamp}] ${info.message}`)
  ),
  maxsize: 10000000, // 10 MB
  maxFiles: 1,
}

export const levelToStr = (lvl: LogLevel): string => LogLevel[lvl]

export function render(level: LogLevel, entry: LogEntry): string | null {
  if (level >= entry.level) {
    const renderFn = entry.error ? renderError : renderMsg
    return stripAnsi(renderFn(entry))
  }
  return null
}

export class FileWriter extends Writer {
  type = "file"

  protected fileLogger: winston.Logger | null
  protected logFilePath: string
  protected fileTransportOptions: FileTransportOptions

  constructor(config: FileWriterConfig) {
    super({ level: config.level })

    const { logFilePath, fileTransportOptions = DEFAULT_FILE_TRANSPORT_OPTIONS } = config
    this.fileTransportOptions = fileTransportOptions
    this.logFilePath = logFilePath
    this.fileLogger = null
  }

  static async factory(config: FileWriterConfig) {
    const { logFilePath, truncatePrevious } = config
    if (!isAbsolute(logFilePath)) {
      throw new InternalError({
        message: `FileWriter expected absolute log file path, got ${logFilePath}`,
      })
    }
    await ensureDir(dirname(logFilePath))
    if (truncatePrevious) {
      try {
        await truncate(logFilePath)
      } catch (_) {}
    }
    return new this(config) // We use `this` in order for this factory method to work for subclasses
  }

  // Only init if needed to prevent unnecessary file writes
  initFileLogger() {
    return winston.createLogger({
      level: levelToStr(this.level),
      transports: [
        new winston.transports.File({
          ...this.fileTransportOptions,
          filename: this.logFilePath,
        }),
      ],
    })
  }

  render(entry: LogEntry): string | null {
    return render(this.level, entry)
  }

  write(entry: LogEntry) {
    const out = this.render(entry)
    if (out) {
      if (!this.fileLogger) {
        this.fileLogger = this.initFileLogger()
      }
      this.fileLogger.log(levelToStr(entry.level), out)
    }
  }
}
