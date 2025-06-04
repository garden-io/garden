/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { LogEntry } from "../log-entry.js"
import type { Logger } from "../logger.js"
import { LogLevel } from "../logger.js"

export interface BaseWriterParams {
  level?: LogLevel
  output?: NodeJS.WriteStream
}

export abstract class Writer {
  abstract type: string
  public level: LogLevel
  public output: NodeJS.WriteStream

  constructor({ level = LogLevel.info, output = process.stdout }: BaseWriterParams = {}) {
    this.level = level
    this.output = output
  }

  abstract write(entry: LogEntry, logger: Logger): void
}
