/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import winston from "winston"
import { LogEntry } from "../log-entry"
import { LogLevel } from "../logger"
import { formatForJson } from "../renderers"
import { FileWriter, levelToStr } from "./file-writer"

export function renderAsJson(level: LogLevel, entry: LogEntry): string | null {
  if (level >= entry.level) {
    const jsonEntry = formatForJson(entry)
    const empty = !(jsonEntry.msg || jsonEntry.data)
    return empty ? null : JSON.stringify(jsonEntry)
  }
  return null
}

export class JsonFileWriter extends FileWriter {
  type = "file-json"

  // Only init if needed to prevent unnecessary file writes
  initFileLogger() {
    return winston.createLogger({
      level: levelToStr(this.level),
      transports: [
        new winston.transports.File({
          ...this.fileTransportOptions,
          // We override the format here, since we want a pure JSON line (without a timestamp prefix).
          format: winston.format.printf((info) => info.message),
          filename: this.logFilePath,
        }),
      ],
    })
  }

  render(entry: LogEntry): string | null {
    return renderAsJson(this.level, entry)
  }

  onGraphChange(entry: LogEntry): void {
    const out = this.render(entry)
    if (out) {
      if (!this.fileLogger) {
        this.fileLogger = this.initFileLogger()
      }
      this.fileLogger.log(levelToStr(entry.level), out)
    }
  }
}
