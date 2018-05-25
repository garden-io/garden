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

export interface FileWriterConfig {
  level: LogLevel
  root: string
  filename?: string
  fileTransportOptions?: {}
}

const { combine: winstonCombine, timestamp, printf } = winston.format

const DEFAULT_LOG_FILENAME = "development.log"
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

  constructor(config: FileWriterConfig) {
    const {
      fileTransportOptions = DEFAULT_FILE_TRANSPORT_OPTIONS,
      filename = DEFAULT_LOG_FILENAME,
      level,
      root,
    } = config

    super({ level })

    this.winston = winston.createLogger({
      level: levelToStr(level),
      transports: [
        new winston.transports.File({
          ...fileTransportOptions,
          filename: path.join(root, filename),
        }),
      ],
    })
  }

  render(entry: LogEntry): string | null {
    const renderFn = entry.level === LogLevel.error ? renderError : renderMsg
    if (validate(this.level, entry)) {
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
