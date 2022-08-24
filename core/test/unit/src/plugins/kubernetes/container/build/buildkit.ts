/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { ContainerBuildAction } from "../../../../../../../src/plugins/container/config"
import { getBuildkitFlags } from "../../../../../../../src/plugins/kubernetes/container/build/buildkit"
import { getDataDir, makeTestGarden } from "../../../../../../helpers"

describe("getBuildkitFlags", () => {
  it("should correctly format the build target option", async () => {
    const projectRoot = getDataDir("test-project-container")
    const garden = await makeTestGarden(projectRoot)
    const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    const rawBuild = graph.getBuild("module-a.build") as ContainerBuildAction
    const build = await garden.resolveAction({ action: rawBuild, log: garden.log, graph })

    build._config.spec.targetStage = "foo"

    const flags = getBuildkitFlags(build)

    expect(flags).to.eql(["--opt", "build-arg:GARDEN_MODULE_VERSION=" + build.versionString, "--opt", "target=foo"])
  })
})
