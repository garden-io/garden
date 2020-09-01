/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import td from "testdouble"

import { ConfigGraph, GardenModule, ProjectConfig } from "@garden-io/sdk/types"
import { expect } from "chai"
import { makeTestGarden, TestGarden } from "@garden-io/sdk/testing"
import { defaultApiVersion, defaultNamespace } from "@garden-io/sdk/constants"
import { gardenPlugin } from ".."
import { containerHelpers } from "@garden-io/core/build/src/plugins/container/helpers"

describe("jib-container", () => {
  const projectRoot = join(__dirname, "test-project")

  const projectConfig: ProjectConfig = {
    apiVersion: defaultApiVersion,
    kind: "Project",
    name: "test",
    path: projectRoot,
    defaultEnvironment: "default",
    dotIgnoreFiles: [],
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
      plugins: [gardenPlugin],
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
      expect(module.outputs).to.eql({
        "deployment-image-id": "module:" + module.version.versionString,
        "deployment-image-name": "module",
        "local-image-id": "module:" + module.version.versionString,
        "local-image-name": "module",
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

    context("tarOnly=false", () => {
      it("builds a maven project", async () => {
        module.spec.build.projectType = "maven"
        module.spec.build.tarOnly = false

        const dockerCli = td.replace(containerHelpers, "dockerCli")

        const res = await actions.build({
          module,
          log: garden.log,
          graph,
        })

        const { tarPath } = res.details

        td.verify(
          dockerCli({
            cwd: module.path,
            args: ["load", "--input", tarPath],
            log: td.matchers.anything(),
            ctx: td.matchers.anything(),
          })
        )
      })

      it("builds a gradle project and pushes to the local docker daemon", async () => {
        module.spec.build.projectType = "gradle"
        module.spec.build.tarOnly = false

        const dockerCli = td.replace(containerHelpers, "dockerCli")

        const res = await actions.build({
          module,
          log: garden.log,
          graph,
        })

        const { tarPath } = res.details

        td.verify(
          dockerCli({
            cwd: module.path,
            args: ["load", "--input", tarPath],
            log: td.matchers.anything(),
            ctx: td.matchers.anything(),
          })
        )
      })
    })
  })
})
