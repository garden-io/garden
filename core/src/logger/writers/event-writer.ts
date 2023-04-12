/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { PluginEventBroker } from "../../plugin-context"
import type { LogEntry } from "../log-entry"
import { Logger, logLevelToString } from "../logger"
import { formatForTerminal } from "../renderers"
import { BaseWriterParams, Writer } from "./base"

interface EventWriterParams extends BaseWriterParams {
  defaultOrigin?: string
  events: PluginEventBroker
}

export class EventLogWriter extends Writer {
  type = "event"

  private defaultOrigin?: string
  private events: PluginEventBroker

  constructor(params: EventWriterParams) {
    super(params)
    this.defaultOrigin = params.defaultOrigin
    this.events = params.events
  }

  write(entry: LogEntry, logger: Logger) {
    const out = formatForTerminal(entry, logger)
    if (out) {
      this.events.emit("log", {
        origin: entry.context.origin || this.defaultOrigin,
        level: logLevelToString(entry.level),
        msg: out,
        timestamp: entry.timestamp,
      })
    }
    return out
  }
}
