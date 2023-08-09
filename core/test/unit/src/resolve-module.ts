/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { join, dirname } from "path"
import { getDataDir, makeTestGarden, makeTestGardenA, TestGarden } from "../../helpers"
import { DEFAULT_BUILD_TIMEOUT_SEC } from "../../../src/constants"
import { ConfigGraph } from "../../../src/graph/config-graph"
import { loadYamlFile } from "../../../src/util/util"

describe("ModuleResolver", () => {
  // Note: We test the ModuleResolver via the TestGarden.resolveModule method, for convenience.

  it("handles a project template reference in a build dependency name", async () => {
    const garden = await makeTestGardenA()

    garden.setModuleConfigs([
      {
        name: "test-project-a",
        type: "test",
        path: join(garden.projectRoot, "module-a"),
        build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
      },
      {
        name: "module-b",
        type: "test",
        path: join(garden.projectRoot, "module-b"),
        build: { dependencies: [{ name: "${project.name}", copy: [] }], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
      },
    ])

    const module = await garden.resolveModule("module-b")
    expect(module.build.dependencies[0].name).to.equal("test-project-a")
  })

  it("handles a module template reference in a build dependency name", async () => {
    const garden = await makeTestGardenA()

    garden.setModuleConfigs([
      {
        name: "module-a",
        type: "test",
        path: join(garden.projectRoot, "module-a"),
        build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
      },
      {
        name: "module-b",
        type: "test",
        path: join(garden.projectRoot, "module-b"),
        build: { dependencies: [{ name: "${modules.module-a.name}", copy: [] }], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
      },
    ])

    const module = await garden.resolveModule("module-b")
    expect(module.build.dependencies[0].name).to.equal("module-a")
  })
})

describe("functional tests", () => {
  describe("render templates", () => {
    let dataDir: string
    let garden: TestGarden
    let graph: ConfigGraph

    before(async () => {
      dataDir = getDataDir("test-projects", "template-configs")
      garden = await makeTestGarden(dataDir)
      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    })

    const expectedExtraFlags = "-Dbuilder=docker"

    context("should resolve vars and inputs with defaults", () => {
      it("with RenderTemplate and ConfigTemplate.configs", async () => {
        const buildAction = graph.getBuild("render-template-based-build")
        const spec = buildAction.getConfig().spec
        expect(spec).to.exist
        expect(spec.extraFlags).to.eql([expectedExtraFlags])
      })

      it("with RenderTemplate and ConfigTemplate.modules", async () => {
        const buildAction = graph.getBuild("render-template-based-module")
        const spec = buildAction.getConfig().spec
        expect(spec).to.exist
        expect(spec.extraFlags).to.eql([expectedExtraFlags])
      })

      it("with ModuleTemplate and ConfigTemplate.modules", async () => {
        const buildAction = graph.getBuild("templated-module-based-module")
        const spec = buildAction.getConfig().spec
        expect(spec).to.exist
        expect(spec.extraFlags).to.eql([expectedExtraFlags])
      })

      it("with RenderTemplate and ConfigTemplate.configs", async () => {
        const buildAction = graph.getBuild("templated-module-based-build")
        const spec = buildAction.getConfig().spec
        expect(spec).to.exist
        expect(spec.extraFlags).to.eql([expectedExtraFlags])
      })
    })
  })

  describe("render templates using $each", () => {
    let dataDir: string
    let garden: TestGarden

    before(async () => {
      dataDir = getDataDir("test-projects", "merge-in-module-template")
      garden = await makeTestGarden(dataDir)
    })

    context("should resolve vars and inputs with defaults", () => {
      it("with RenderTemplate and ConfigTemplate.configs", async () => {
        const resolvedModule = await garden.resolveModule("bug-service")
        const [generateFile] = resolvedModule.generateFiles!
        const generatedFileDir = dirname(generateFile.sourcePath!)
        const fileName = join(generatedFileDir, generateFile.targetPath)

        const parsed = await loadYamlFile(fileName)

        const templatedEnv = parsed.spec.template.spec.containers[0].env

        expect(templatedEnv).to.eql([
          { name: "FIELD1", value: "hi" },
          { name: "FIELD2", value: "bye" },
          { name: "HELLO", value: "GOODBYE" },
        ])
      })
    })
  })
})
