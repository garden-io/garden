/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Log } from "./logger/log-entry.js"

interface LoggerContext {
  readonly history: Set<string>
}

const loggerContext: LoggerContext = {
  history: new Set<string>(),
}

export function resetNonRepeatableWarningHistory() {
  loggerContext.history.clear()
}

export function emitNonRepeatableWarning(log: Log, message: string) {
  if (loggerContext.history.has(message)) {
    return
  }

  log.warn(message)
  loggerContext.history.add(message)
}
