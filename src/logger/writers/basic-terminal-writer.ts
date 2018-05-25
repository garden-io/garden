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
import {
  formatForTerminal,
} from "../renderers"
import { LogEntry, RootLogNode } from "../index"
import { validate } from "../util"
import { Writer } from "./base"

export class BasicTerminalWriter extends Writer {
  public level: LogLevel

  render(entry: LogEntry, rootLogNode: RootLogNode): string | null {
    const level = this.level || rootLogNode.level
    if (validate(level, entry)) {
      return formatForTerminal(entry)
    }
    return null
  }

  onGraphChange(entry: LogEntry, rootLogNode: RootLogNode) {
    const out = this.render(entry, rootLogNode)
    if (out) {
      process.stdout.write(out)
    }
  }

  stop() { }
}
