/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { basicRender } from "../renderers"
import { LogEntry } from "../log-entry"
import { Logger } from "../logger"
import { BaseWriterParams, Writer } from "./base"

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

  onGraphChange(entry: LogEntry, logger: Logger) {
    const out = basicRender(entry, logger)
    if (out) {
      this.writeCallback(out)
    }
  }

  stop() {}
}
