/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import stringify from "json-stringify-safe"
import type { LogEntry, LogMetadata } from "../log-entry.js"
import type { Logger } from "../logger.js"
import { Writer } from "./base.js"
import { formatForJson } from "../renderers.js"

export interface JsonLogEntry {
  msg: string
  timestamp: string
  data?: any
  errorDetail?: string
  section?: string
  metadata?: LogMetadata
  level: string
}

export class JsonTerminalWriter extends Writer {
  type = "json"

  render(entry: LogEntry, logger: Logger): string | null {
    const level = this.level || logger.level
    if (level >= entry.level) {
      const jsonEntry = formatForJson(entry)
      const empty = !(jsonEntry.msg || jsonEntry.data)
      return empty ? null : stringify(jsonEntry)
    }
    return null
  }

  write(entry: LogEntry, logger: Logger) {
    const out = this.render(entry, logger)
    if (out) {
      process.stdout.write(out + "\n")
    }
  }
}
