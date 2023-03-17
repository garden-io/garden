/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Logger, LogLevel } from "./logger/logger"
import chalk from "chalk"

interface LoggerContext {
  readonly history: Set<string>
  logger: Logger | undefined
}

const loggerContext: LoggerContext = {
  history: new Set<string>(),
  logger: undefined,
}

export function emitNonRepeatableWarning(message: string) {
  if (loggerContext.history.has(message)) {
    return
  }

  if (!loggerContext.logger) {
    loggerContext.logger = Logger.initialize({
      level: LogLevel.info,
      type: "default",
      storeEntries: false,
    })
  }
  const log = loggerContext.logger.makeNewLogContext()
  log.warn({
    symbol: "warning",
    msg: chalk.yellow(message),
  })
  loggerContext.history.add(message)
}
