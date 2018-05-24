/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  LogLevel,
} from "../types"

import { LogEntry, RootLogNode } from "../index"

export interface WriterConfig {
  level?: LogLevel
}

export abstract class Writer {
  public level: LogLevel | undefined

  constructor({ level }: WriterConfig = {}) {
    this.level = level
  }

  abstract render(...args): string | string[] | null
  abstract onGraphChange(entry: LogEntry, rootLogNode: RootLogNode): void
  abstract stop(): void
}
