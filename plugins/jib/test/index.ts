/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dirname, join, resolve } from "node:path"

import type { GardenModule } from "@garden-io/sdk/build/src/types.js"
import { expect } from "chai"
import type { TestGarden } from "@garden-io/sdk/build/src/testing.js"
import { makeTestGarden } from "@garden-io/sdk/build/src/testing.js"
import { gardenPlugin } from "../src/index.js"
import type { JibBuildAction } from "../src/util.js"
import type { Resolved } from "@garden-io/core/build/src/actions/types.js"
import type { ResolvedConfigGraph } from "@garden-io/core/build/src/graph/config-graph.js"
import { createActionLog } from "@garden-io/core/build/src/logger/log-entry.js"
import { fileURLToPath } from "node:url"

const moduleDirName = dirname(fileURLToPath(import.meta.url))

describe("jib-container", function () {
  // eslint-disable-next-line no-invalid-this
  this.timeout(180 * 1000) // initial jib build can take a long time

  const projectRoot = resolve(moduleDirName, "../../test/", "test-project")

  let garden: TestGarden
  let graph: ResolvedConfigGraph
  let module: GardenModule
  let action: Resolved<JibBuildAction>

  before(async () => {
    garden = await makeTestGarden(projectRoot, {
      plugins: [gardenPlugin()],
    })
  })

  beforeEach(async () => {
    graph = await garden.getResolvedConfigGraph({ log: garden.log, emit: false })
    module = graph.getModule("foo")
    action = graph.getBuild("foo")
  })

  describe("configure", () => {
    it("sets relevant parameters on the buildConfig and spec fields", async () => {
      expect(module.buildConfig?.projectType).to.equal("auto")
      expect(module.buildConfig?.jdkVersion).to.equal(11)
      expect(module.buildConfig?.dockerfile).to.equal("_jib")
      expect(module.spec.dockerfile).to.equal("_jib")
    })
  })

  describe("getModuleOutputs", () => {
    it("correctly sets the module outputs", async () => {
      const image = "gardenci/jib-test-project"

      expect(module.outputs).to.eql({
        "deployment-image-id": image + ":" + module.version.versionString,
        "deployment-image-name": image,
        "local-image-id": image + ":" + module.version.versionString,
        "local-image-name": image,
        "deployment-image-tag": module.version.versionString,
      })
    })
  })

  describe("build", () => {
    context("tarOnly=true", () => {
      it("builds a maven project", async () => {
        action.getSpec().projectType = "maven"
        action.getSpec().tarOnly = true

        const router = await garden.getActionRouter()
        const actionLog = createActionLog({ log: garden.log, action })

        const { result: res } = await router.build.build({
          action,
          log: actionLog,
          graph,
        })

        const tarPath = res.detail?.details?.["tarPath"] as string

        expect(tarPath).to.equal(
          join(action.sourcePath(), "target", `jib-image-foo-${module.version.versionString}.tar`)
        )
      })

      it("builds a gradle project", async () => {
        action.getSpec().projectType = "gradle"
        action.getSpec().tarOnly = true

        const router = await garden.getActionRouter()
        const actionLog = createActionLog({ log: garden.log, action })

        const { result: res } = await router.build.build({
          action,
          log: actionLog,
          graph,
        })

        const tarPath = res.detail?.details?.["tarPath"] as string

        expect(tarPath).to.equal(
          join(action.sourcePath(), "build", `jib-image-foo-${module.version.versionString}.tar`)
        )
      })
    })

    // NOTE: We can't currently run these tests as part of CI because they require push access to a registry
    // This however is covered by the jib-container e2e test project
    context("tarOnly=false", () => {
      it.skip("builds a maven project and pushed to a registry", async () => {
        action.getSpec().projectType = "maven"
        action.getSpec().tarOnly = false

        const router = await garden.getActionRouter()
        const actionLog = createActionLog({ log: garden.log, action })

        await router.build.build({
          action,
          log: actionLog,
          graph,
        })
      })

      it.skip("builds a gradle project and pushes to a registry", async () => {
        action.getSpec().projectType = "gradle"
        action.getSpec().tarOnly = false

        const router = await garden.getActionRouter()
        const actionLog = createActionLog({ log: garden.log, action })

        await router.build.build({
          action,
          log: actionLog,
          graph,
        })
      })
    })

    context("dockerBuild=true", () => {
      it("builds a maven project", async () => {
        action.getSpec().projectType = "maven"
        action.getSpec().tarOnly = false
        action.getSpec().dockerBuild = true

        const router = await garden.getActionRouter()
        const actionLog = createActionLog({ log: garden.log, action })

        await router.build.build({
          action,
          log: actionLog,
          graph,
        })
      })

      it("builds a gradle project", async () => {
        action.getSpec().projectType = "gradle"
        action.getSpec().tarOnly = false
        action.getSpec().dockerBuild = true

        const router = await garden.getActionRouter()
        const actionLog = createActionLog({ log: garden.log, action })

        await router.build.build({
          action,
          log: actionLog,
          graph,
        })
      })
    })
  })
})
