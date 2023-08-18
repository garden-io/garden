/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import sinon from "sinon"
import td from "testdouble"
import timekeeper from "timekeeper"
import { getDefaultProfiler } from "../src/util/profiling"
import { gardenEnv } from "../src/constants"
import { testFlags } from "../src/util/util"
import { initTestLogger, testProjectTempDirs } from "./helpers"

require("source-map-support").install()
initTestLogger()

// Global hooks
exports.mochaHooks = {
  async beforeAll() {
    // override fetch to handle node 18 issue when using nock
    // https://github.com/nock/nock/issues/2336
    // TODO: remove when we move to node 20
    const fetch = require("node-fetch")
    globalThis.fetch = fetch

    getDefaultProfiler().setEnabled(true)
    gardenEnv.GARDEN_DISABLE_ANALYTICS = true
    testFlags.expandErrors = true
    testFlags.disableShutdown = true
  },

  async afterAll() {
    // eslint-disable-next-line no-console
    console.log(getDefaultProfiler().report())
    await Promise.all(Object.values(testProjectTempDirs).map((d) => d.cleanup()))
  },

  beforeEach() {},

  afterEach() {
    sinon.restore()
    td.reset()
    timekeeper.reset()
  },
}
