/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { getBuildkitModuleFlags } from "../../../../../../../src/plugins/kubernetes/container/build/buildkit"
import { getDataDir, makeTestGarden } from "../../../../../../helpers"

describe("getBuildkitModuleFlags", () => {
  it("should correctly format the build target option", async () => {
    const projectRoot = getDataDir("test-project-container")
    const garden = await makeTestGarden(projectRoot)
    const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    const module = graph.getModule("module-a")

    module.spec.build.targetImage = "foo"

    const flags = getBuildkitModuleFlags(module)

    expect(flags).to.eql([
      "--opt",
      "build-arg:GARDEN_MODULE_VERSION=" + module.version.versionString,
      "--opt",
      "target=foo",
    ])
  })
})
