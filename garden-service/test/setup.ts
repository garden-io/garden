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
import { makeTestGardenA } from "./helpers"
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
before(async function(this: any) {
  // tslint:disable-next-line:no-invalid-this
  this.timeout(10000)

  // doing this to make sure ts-node completes compilation before running tests
  await makeTestGardenA()
})

beforeEach(() => {})
afterEach(() => {
  td.reset()
  timekeeper.reset()
})
