/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { formatForTerminal } from "../renderers.js"
import type { LogEntry } from "../log-entry.js"
import type { Logger } from "../logger.js"
import type { BaseWriterParams } from "./base.js"
import { Writer } from "./base.js"

type WriteCallback = (data: string) => void

export class InkTerminalWriter extends Writer {
  type = "ink"

  private writeCallback: WriteCallback

  constructor(params: BaseWriterParams) {
    super(params)
    this.writeCallback = (data: string) => {
      this.output.write(data)
    }
  }

  setWriteCallback(cb: WriteCallback) {
    this.writeCallback = cb
  }

  write(entry: LogEntry, logger: Logger) {
    const out = formatForTerminal(entry, logger)
    if (out) {
      this.writeCallback(out)
    }
  }
}
