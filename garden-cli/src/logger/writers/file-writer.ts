/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as winston from "winston"
import { join } from "path"
import * as stripAnsi from "strip-ansi"
import { ensureDir, truncate } from "fs-extra"

import { LogLevel } from "../log-node"
import { LogEntry } from "../log-entry"
import { Writer } from "./base"
import { validate } from "../util"
import {
  renderError,
  renderMsg,
} from "../renderers"
import { LOGS_DIR } from "../../constants"

export interface FileWriterConfig {
  level: LogLevel
  root: string
  filename: string
  path?: string
  fileTransportOptions?: {}
  truncatePrevious?: boolean
}

type FileTransportOptions = winston.transports.FileTransportOptions

const { combine: winstonCombine, timestamp, printf } = winston.format

const DEFAULT_FILE_TRANSPORT_OPTIONS: FileTransportOptions = {
  format: winstonCombine(
    timestamp(),
    printf(info => `\n[${info.timestamp}] ${info.message}`),
  ),
  maxsize: 10000000, // 10 MB
  maxFiles: 1,
}

const levelToStr = (lvl: LogLevel): string => LogLevel[lvl]

export class FileWriter extends Writer {
  private fileLogger: winston.Logger | null
  private filePath: string
  private fileTransportOptions: FileTransportOptions

  public level: LogLevel

  constructor(filePath: string, config: FileWriterConfig) {
    const {
      fileTransportOptions = DEFAULT_FILE_TRANSPORT_OPTIONS,
      level,
    } = config

    super({ level })

    this.fileTransportOptions = fileTransportOptions
    this.filePath = filePath
    this.fileLogger = null
  }

  static async factory(config: FileWriterConfig) {
    const {
      filename,
      root,
      truncatePrevious,
      path = LOGS_DIR,
    } = config
    const fullPath = join(root, path)
    await ensureDir(fullPath)
    const filePath = join(fullPath, filename)
    if (truncatePrevious) {
      try {
        await truncate(filePath)
      } catch (_) {
      }
    }
    return new FileWriter(filePath, config)
  }

  // Only init if needed to prevent unnecessary file writes
  initFileLogger() {
    return winston.createLogger({
      level: levelToStr(this.level),
      transports: [
        new winston.transports.File({
          ...this.fileTransportOptions,
          filename: this.filePath,
        }),
      ],
    })
  }

  render(entry: LogEntry): string | null {
    if (validate(this.level, entry)) {
      const renderFn = entry.level === LogLevel.error ? renderError : renderMsg
      return stripAnsi(renderFn(entry))
    }
    return null
  }

  onGraphChange(entry: LogEntry) {
    const out = this.render(entry)
    if (out) {
      if (!this.fileLogger) {

        this.fileLogger = this.initFileLogger()
      }
      this.fileLogger.log(levelToStr(entry.level), out)
    }
  }

  stop() { }
}
