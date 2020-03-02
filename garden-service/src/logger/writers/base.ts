/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { LogEntry } from "../log-entry"
import { Logger } from "../logger"
import { LogLevel } from "../log-node"

export abstract class Writer {
  abstract type: string

  constructor(public level: LogLevel = LogLevel.info) {}

  abstract onGraphChange(entry: LogEntry, logger: Logger): void
  abstract stop(): void
  cleanup(): void {}
}
