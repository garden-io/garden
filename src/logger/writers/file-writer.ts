/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as winston from "winston"
import * as path from "path"
import * as stripAnsi from "strip-ansi"
import { ensureDir, truncate } from "fs-extra"

import {
  LogLevel,
} from "../types"
import { LogEntry } from "../index"
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
  logDirPath?: string
  fileTransportOptions?: {}
  truncatePrevious?: boolean
}

const { combine: winstonCombine, timestamp, printf } = winston.format

const DEFAULT_FILE_TRANSPORT_OPTIONS = {
  format: winstonCombine(
    timestamp(),
    printf(info => `\n[${info.timestamp}] ${info.message}`),
  ),
  maxsize: 10000000, // 10 MB
  maxFiles: 1,
}

const levelToStr = (lvl: LogLevel): string => LogLevel[lvl]

export class FileWriter extends Writer {
  private winston: any // Types are still missing from Winston 3.x.x.

  public level: LogLevel

  constructor(filePath: string, config: FileWriterConfig) {
    const {
      fileTransportOptions = DEFAULT_FILE_TRANSPORT_OPTIONS,
      level,
    } = config

    super({ level })

    this.winston = winston.createLogger({
      level: levelToStr(level),
      transports: [
        new winston.transports.File({
          ...fileTransportOptions,
          filename: filePath,
        }),
      ],
    })
  }

  static async factory(config: FileWriterConfig) {
    const {
      filename,
      root,
      truncatePrevious,
      logDirPath = LOGS_DIR,
    } = config
    const fullPath = path.join(root, logDirPath)
    await ensureDir(fullPath)
    const filePath = path.join(fullPath, filename)
    if (truncatePrevious) {
      try {
        await truncate(filePath)
      } catch (_) {
      }
    }
    return new FileWriter(filePath, config)
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
      this.winston.log(levelToStr(entry.level), out)
    }
  }

  stop() { }
}
