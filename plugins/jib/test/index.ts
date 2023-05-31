/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"

import { GardenModule, ProjectConfig } from "@garden-io/sdk/types"
import { expect } from "chai"
import { makeTestGarden, TestGarden } from "@garden-io/sdk/testing"
import { defaultNamespace } from "@garden-io/sdk/constants"
import { gardenPlugin } from ".."
import { defaultDotIgnoreFile } from "@garden-io/core/build/src/util/fs"
import { JibBuildAction } from "../util"
import { Resolved } from "@garden-io/core/build/src/actions/types"
import { ResolvedConfigGraph } from "@garden-io/core/build/src/graph/config-graph"
import { createActionLog } from "@garden-io/core/build/src/logger/log-entry"
import { GardenApiVersion } from "@garden-io/core/build/src/constants"

describe.skip("jib-container", function () {
  // eslint-disable-next-line no-invalid-this
  this.timeout(180 * 1000) // initial jib build can take a long time

  const projectRoot = join(__dirname, "test-project")

  const projectConfig: ProjectConfig = {
    apiVersion: GardenApiVersion.v1,
    kind: "Project",
    name: "test",
    path: projectRoot,
    defaultEnvironment: "default",
    dotIgnoreFile: defaultDotIgnoreFile,
    environments: [{ name: "default", defaultNamespace, variables: {} }],
    providers: [{ name: "jib" }],
    variables: {},
  }

  let garden: TestGarden
  let graph: ResolvedConfigGraph
  let module: GardenModule
  let action: Resolved<JibBuildAction>

  before(async () => {
    garden = await makeTestGarden(projectRoot, {
      plugins: [gardenPlugin()],
      config: projectConfig,
    })
    graph = await garden.getResolvedConfigGraph({ log: garden.log, emit: false })
  })

  beforeEach(async () => {
    graph = await garden.getResolvedConfigGraph({ log: garden.log, emit: false })
    module = graph.getModule("module")
    action = graph.getBuild("module")
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
      const image = "eu.gcr.io/garden-ci/jib-test-project"

      expect(module.outputs).to.eql({
        "deployment-image-id": image + ":" + module.version.versionString,
        "deployment-image-name": image,
        "local-image-id": image + ":" + module.version.versionString,
        "local-image-name": image,
      })
    })
  })

  describe("build", () => {
    context("tarOnly=true", () => {
      it("builds a maven project", async () => {
        action.getSpec().projectType = "maven"
        action.getSpec().tarOnly = true

        const router = await garden.getActionRouter()
        const actionLog = createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind })

        const { result: res } = await router.build.build({
          action,
          log: actionLog,
          graph,
        })

        const tarPath = res.detail?.details.tarPath as string

        expect(tarPath).to.equal(join(module.path, "target", `jib-image-module-${module.version.versionString}.tar`))
      })

      it("builds a gradle project", async () => {
        action.getSpec().projectType = "gradle"
        action.getSpec().tarOnly = true

        const router = await garden.getActionRouter()
        const actionLog = createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind })

        const { result: res } = await router.build.build({
          action,
          log: actionLog,
          graph,
        })

        const tarPath = res.detail?.details.tarPath as string

        expect(tarPath).to.equal(join(module.path, "build", `jib-image-module-${module.version.versionString}.tar`))
      })
    })

    // NOTE: We can't currently run these tests as part of CI because they require push access to a registry
    // This however is covered by the jib-container e2e test project
    context("tarOnly=false", () => {
      it.skip("builds a maven project and pushed to a registry", async () => {
        action.getSpec().projectType = "maven"
        action.getSpec().tarOnly = false

        const router = await garden.getActionRouter()
        const actionLog = createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind })

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
        const actionLog = createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind })

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
        const actionLog = createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind })

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
        const actionLog = createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind })

        await router.build.build({
          action,
          log: actionLog,
          graph,
        })
      })
    })
  })
})
