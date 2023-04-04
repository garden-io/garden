/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { LogEntry } from "../log-entry"
import { Logger } from "../logger"
import { formatForTerminal } from "../renderers"
import { Writer } from "./base"

export class TerminalWriter extends Writer {
  type = "default"

  write(entry: LogEntry, logger: Logger) {
    const out = formatForTerminal(entry, logger)
    if (out) {
      this.output.write(out)
    }
    return out
  }
}
