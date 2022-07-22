/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"

import { ConfigGraph, GardenModule, ProjectConfig } from "@garden-io/sdk/types"
import { expect } from "chai"
import { makeTestGarden, TestGarden } from "@garden-io/sdk/testing"
import { defaultApiVersion, defaultNamespace } from "@garden-io/sdk/constants"
import { gardenPlugin } from ".."

describe("jib-container", function () {
  // tslint:disable-next-line: no-invalid-this
  this.timeout(180 * 1000) // initial jib build can take a long time

  const projectRoot = join(__dirname, "test-project")

  const projectConfig: ProjectConfig = {
    apiVersion: defaultApiVersion,
    kind: "Project",
    name: "test",
    path: projectRoot,
    defaultEnvironment: "default",
    dotIgnoreFile: [],
    environments: [{ name: "default", defaultNamespace, variables: {} }],
    providers: [{ name: "jib" }],
    variables: {},
  }

  let garden: TestGarden
  let graph: ConfigGraph
  let actions: TestGarden["actionHelper"]
  let module: GardenModule

  before(async () => {
    garden = await makeTestGarden(projectRoot, {
      plugins: [gardenPlugin()],
      config: projectConfig,
    })
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    actions = await garden.getActionRouter()
  })

  beforeEach(async () => {
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    module = graph.getModule("module")
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
        module.spec.build.projectType = "maven"
        module.spec.build.tarOnly = true

        const res = await actions.build({
          module,
          log: garden.log,
          graph,
        })

        const { tarPath } = res.details

        expect(tarPath).to.equal(join(module.path, "target", `jib-image-module-${module.version.versionString}.tar`))
      })

      it("builds a gradle project", async () => {
        module.spec.build.projectType = "gradle"
        module.spec.build.tarOnly = true

        const res = await actions.build({
          module,
          log: garden.log,
          graph,
        })

        const { tarPath } = res.details

        expect(tarPath).to.equal(join(module.path, "build", `jib-image-module-${module.version.versionString}.tar`))
      })
    })

    // NOTE: We can't currently run these tests as part of CI because they require push access to a registry
    // This however is covered by the jib-container e2e test project
    context("tarOnly=false", () => {
      it.skip("builds a maven project and pushed to a registry", async () => {
        module.spec.build.projectType = "maven"
        module.spec.build.tarOnly = false

        await actions.build({
          module,
          log: garden.log,
          graph,
        })
      })

      it.skip("builds a gradle project and pushes to a registry", async () => {
        module.spec.build.projectType = "gradle"
        module.spec.build.tarOnly = false

        await actions.build({
          module,
          log: garden.log,
          graph,
        })
      })
    })

    context("dockerBuild=true", () => {
      it("builds a maven project", async () => {
        module.spec.build.projectType = "maven"
        module.spec.build.tarOnly = false
        module.spec.build.dockerBuild = true

        await actions.build({
          module,
          log: garden.log,
          graph,
        })
      })

      it("builds a gradle project", async () => {
        module.spec.build.projectType = "gradle"
        module.spec.build.tarOnly = false
        module.spec.build.dockerBuild = true

        await actions.build({
          module,
          log: garden.log,
          graph,
        })
      })
    })
  })
})
