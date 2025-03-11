/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import sinon from "sinon"
import * as td from "testdouble"
import timekeeper from "timekeeper"
import { getDefaultProfiler } from "../src/util/profiling.js"
import { GardenApiVersion, gardenEnv } from "../src/constants.js"
import { testFlags } from "../src/util/util.js"
import { initTestLogger, testProjectTempDirs } from "./helpers.js"
import mocha from "mocha"
import sourceMapSupport from "source-map-support"
import { UnresolvedTemplateValue } from "../src/template/types.js"
import { setProjectApiVersion } from "../src/project-api-version.js"
import { RootLogger } from "../src/logger/logger.js"

sourceMapSupport.install()

let lastTime = performance.now()
const mainBlockCheckup = setInterval(() => {
  const now = performance.now()
  const diff = now - lastTime
  if (diff > 50) {
    // eslint-disable-next-line no-console
    const logfn = diff > 200 ? console.error : console.warn
    logfn(
      `WARNING: Main loop was blocked during testing for ${diff}ms. There seem to be synchronous IO or a tight and expensive loop somewhere.`
    )
  }
  lastTime = now
}, 25)

initTestLogger()

// Work-around for nodejs crash with exit code 0
// This happens when unresolved template values are involved in expect(), it tries to render a diff which triggers the
// "objectSpreadTrap" error and that causes nodejs to exit with code 0 for a mysterious reason.
const origCanonicalize = mocha.utils.canonicalize
mocha.utils.canonicalize = function (value, stack, typeHint) {
  if (value instanceof UnresolvedTemplateValue) {
    return `[${value.toString()}]`
  }
  return origCanonicalize(value, stack, typeHint)
}

const log = RootLogger.getInstance().createLog()

// Global hooks
export const mochaHooks = {
  async beforeAll() {
    getDefaultProfiler().setEnabled(true)
    gardenEnv.GARDEN_DISABLE_ANALYTICS = true
    testFlags.expandErrors = true
    testFlags.disableShutdown = true
  },

  async afterAll() {
    // eslint-disable-next-line no-console
    console.log(getDefaultProfiler().report())
    await Promise.all(Object.values(testProjectTempDirs).map((d) => d.cleanup()))
    clearInterval(mainBlockCheckup)
  },

  beforeEach() {
    // Init globally stored project-level apiVersion, assuming garden.io/v1 for 0.13.
    // TODO(0.14): Remove global project apiVersion?
    setProjectApiVersion({ apiVersion: GardenApiVersion.v1 }, log)
  },

  afterEach() {
    sinon.restore()
    td.reset()
    timekeeper.reset()
  },
}
