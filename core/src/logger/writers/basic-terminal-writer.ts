/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { basicRender } from "../renderers"
import { LogEntry } from "../log-entry"
import { Logger } from "../logger"
import { Writer } from "./base"

export class BasicTerminalWriter extends Writer {
  type = "basic"

  render(entry: LogEntry, logger: Logger): string | null {
    return basicRender(entry, logger)
  }

  onGraphChange(entry: LogEntry, logger: Logger) {
    const out = basicRender(entry, logger)
    if (out) {
      this.output.write(out)
    }
  }

  stop() {}
}
