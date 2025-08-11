/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { makeTestGardenA } from "../../../helpers.js"

describe("BuildAction", () => {
  it("When converted from a module, uses the module's version string in its full version", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    // test-project-a uses module configs, so they'll be run through the module conversion process to generate actions,
    // which is exactly what we need here.
    const graph = await garden.getConfigGraph({ log, emit: false })
    const moduleA = graph.getModule("module-a")
    const buildA = graph.getBuild("module-a")

    expect(moduleA.version.versionString).to.eql(buildA.getFullVersion(log).versionString)
  })
})
