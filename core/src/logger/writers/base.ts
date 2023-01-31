/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { LogEntry } from "../log-entry"
import { Logger } from "../logger"
import { LogLevel } from "../logger"

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

  abstract onGraphChange(entry: LogEntry, logger: Logger): void
  abstract stop(): void
  cleanup(): void {}
}
