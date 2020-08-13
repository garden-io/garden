/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import td from "testdouble"
import timekeeper from "timekeeper"
import { Logger } from "../src/logger/logger"
import { LogLevel } from "../src/logger/log-node"
import { getDefaultProfiler } from "../src/util/profiling"
import { gardenEnv } from "../src/constants"
import { testFlags } from "../src/util/util"
import { ensureConnected } from "../src/db/connection"
// import { BasicTerminalWriter } from "../src/logger/writers/basic-terminal-writer"

// make sure logger is initialized
try {
  Logger.initialize({
    level: LogLevel.info,
    // level: LogLevel.debug,
    // writers: [new BasicTerminalWriter()],
  })
} catch (_) {}

// Global hooks
before(async () => {
  getDefaultProfiler().setEnabled(true)
  gardenEnv.GARDEN_DISABLE_ANALYTICS = true
  testFlags.disableShutdown = true

  // Ensure we're connected to the sqlite db
  await ensureConnected()
})

after(() => {
  // tslint:disable-next-line: no-console
  console.log(getDefaultProfiler().report())
})

beforeEach(() => {})
afterEach(() => {
  td.reset()
  timekeeper.reset()
})
