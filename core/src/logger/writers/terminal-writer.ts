/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { LogEntry } from "../log-entry.js"
import type { Logger } from "../logger.js"
import { formatForTerminal } from "../renderers.js"
import { Writer } from "./base.js"

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
