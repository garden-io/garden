/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import stringify from "json-stringify-safe"
import winston from "winston"
import type { LogEntry } from "../log-entry.js"
import type { LogLevel } from "../logger.js"
import { formatForJson } from "../renderers.js"
import { FileWriter, levelToStr } from "./file-writer.js"

export function renderAsJson(level: LogLevel, entry: LogEntry): string | null {
  if (level >= entry.level) {
    const jsonEntry = formatForJson(entry)
    const empty = !(jsonEntry.msg || jsonEntry.data)
    return empty ? null : stringify(jsonEntry)
  }
  return null
}

export class JsonFileWriter extends FileWriter {
  override type = "file-json"

  // Only init if needed to prevent unnecessary file writes
  override initFileLogger() {
    return winston.createLogger({
      level: levelToStr(this.level),
      transports: [
        new winston.transports.File({
          ...this.fileTransportOptions,
          // We override the format here, since we want a pure JSON line (without a timestamp prefix).
          format: winston.format.printf((info) => info.message as string),
          filename: this.logFilePath,
        }),
      ],
    })
  }

  override render(entry: LogEntry): string | null {
    return renderAsJson(this.level, entry)
  }

  override write(entry: LogEntry): void {
    const out = this.render(entry)
    if (out) {
      if (!this.fileLogger) {
        this.fileLogger = this.initFileLogger()
      }
      this.fileLogger.log(levelToStr(entry.level), out)
    }
  }
}
