/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import td from "testdouble"
import timekeeper from "timekeeper"
import { getDefaultProfiler } from "../src/util/profiling"
import { gardenEnv } from "../src/constants"
import { testFlags } from "../src/util/util"
import { ensureConnected } from "../src/db/connection"
import { initTestLogger, testProjectTempDirs } from "./helpers"
import Bluebird from "bluebird"

require("source-map-support").install()
initTestLogger()

// Global hooks
exports.mochaHooks = {
  async before() {
    getDefaultProfiler().setEnabled(true)
    gardenEnv.GARDEN_DISABLE_ANALYTICS = true
    testFlags.disableShutdown = true

    // Ensure we're connected to the sqlite db
    await ensureConnected()
  },

  async after() {
    // tslint:disable-next-line: no-console
    console.log(getDefaultProfiler().report())
    await Bluebird.map(Object.values(testProjectTempDirs), (d) => d.cleanup())
  },

  beforeEach() {},

  afterEach() {
    td.reset()
    timekeeper.reset()
  },
}
