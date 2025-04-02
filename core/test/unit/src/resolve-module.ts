/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { join, dirname } from "path"
import type { TestGarden } from "../../helpers.js"
import {
  customizedTestPlugin,
  expectError,
  getDataDir,
  makeTestGarden,
  makeTestGardenA,
  projectRootA,
} from "../../helpers.js"
import { DEFAULT_BUILD_TIMEOUT_SEC } from "../../../src/constants.js"
import type { ConfigGraph } from "../../../src/graph/config-graph.js"
import { loadYamlFile } from "../../../src/util/serialization.js"
import type { DeployActionConfig } from "../../../src/actions/deploy.js"
import type { BaseActionConfig } from "../../../src/actions/types.js"
import type { Log } from "../../../src/logger/log-entry.js"
import { resolveMsg } from "../../../src/logger/log-entry.js"
import { deline } from "../../../src/util/string.js"
import stripAnsi from "strip-ansi"
import { resolveAction } from "../../../src/graph/actions.js"

describe("ModuleResolver", () => {
  // Note: We test the ModuleResolver via the TestGarden.resolveModule method, for convenience.

  it("handles a project template reference in a build dependency name", async () => {
    const garden = await makeTestGardenA()

    garden.setPartialModuleConfigs([
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

  it("variable overrides should only affect template evaluation, and not alter the module config itself", async () => {
    const garden = await makeTestGardenA([], {
      variableOverrides: {
        foo: "override",
        bar: "no-override",
      },
    })

    garden.setPartialModuleConfigs([
      {
        name: "test-project-a",
        type: "test",
        path: join(garden.projectRoot, "module-a"),
        build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
        spec: {
          build: {
            command: ["echo", "${var.foo}"],
          },
        },
        variables: {
          foo: "somevalue",
        },
      },
    ])

    const module = await garden.resolveModule("test-project-a")
    expect(module.variables).to.eql({
      // the variables section of the module config should not change
      foo: "somevalue",
    })
    expect(module.spec.build.command).to.eql(
      // --> ${var.foo} should evaluate to "override"
      ["echo", "override"]
    )
  })

  it("handles a module template reference in a build dependency name", async () => {
    const garden = await makeTestGardenA()

    garden.setPartialModuleConfigs([
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

  describe("functional tests", () => {
    describe("render templates", () => {
      let dataDir: string
      let garden: TestGarden
      let graph: ConfigGraph
      let log: Log

      before(async () => {
        dataDir = getDataDir("test-projects", "template-configs")
        garden = await makeTestGarden(dataDir)
        log = garden.log
        graph = await garden.getConfigGraph({ log, emit: false })
      })

      const expectedExtraFlags = "-Dbuilder=docker"

      context("should resolve vars and inputs with defaults", () => {
        it("with RenderTemplate and ConfigTemplate.configs", async () => {
          const action = graph.getBuild("render-template-based-build")
          const buildAction = await resolveAction({ garden, graph, action, log })
          const spec = buildAction.getConfig().spec
          expect(spec).to.exist
          expect(spec.extraFlags).to.eql([expectedExtraFlags])
        })

        it("with RenderTemplate and ConfigTemplate.modules", async () => {
          const action = graph.getBuild("render-template-based-module")
          const buildAction = await resolveAction({ garden, graph, action, log })
          const spec = buildAction.getConfig().spec
          expect(spec).to.exist
          expect(spec.extraFlags).to.eql([expectedExtraFlags])
        })

        it("with ModuleTemplate and ConfigTemplate.modules", async () => {
          const action = graph.getBuild("templated-module-based-module")
          const buildAction = await resolveAction({ garden, graph, action, log })
          const spec = buildAction.getConfig().spec
          expect(spec).to.exist
          expect(spec.extraFlags).to.eql([expectedExtraFlags])
        })

        it("with RenderTemplate and ConfigTemplate.configs", async () => {
          const action = graph.getBuild("templated-module-based-build")
          const buildAction = await resolveAction({ garden, graph, action, log })
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
})

describe("convertModules", () => {
  context("when an action has a build dependency on a module whose conversion didn't result in a build ation", () => {
    it("should remove the build dependency and log an informative warning message", async () => {
      // it("should always include a dummy build, even when the convert handler doesn't doesn't return a build", async () => {
      const testPlugin = customizedTestPlugin({
        name: "test-plugin",
        createModuleTypes: [
          {
            name: "test",
            docs: "I are documentation, yes",
            needsBuild: false,
            handlers: {
              convert: async (params) => {
                const { module, services, dummyBuild } = params
                const actions: BaseActionConfig[] = []
                for (const service of services) {
                  const deployAction: DeployActionConfig = {
                    kind: "Deploy",
                    type: "test",
                    name: service.name,
                    ...params.baseFields,

                    dependencies: params.prepareRuntimeDependencies(service.spec.dependencies, dummyBuild),
                    timeout: service.spec.timeout,

                    spec: {},
                  }
                  actions.push(deployAction)
                }
                dummyBuild && actions.push(dummyBuild)
                return {
                  group: {
                    kind: <const>"Group",
                    name: module.name,
                    path: module.path,
                    actions,
                  },
                }
              },
            },
          },
        ],
      })
      const garden = await makeTestGarden(projectRootA, { plugins: [testPlugin] })
      const log = garden.log

      garden.setPartialModuleConfigs([
        {
          name: "module-a",
          type: "test",
          path: join(garden.projectRoot, "module-a"),
          spec: {
            services: [{ name: "service-a", deployCommand: ["echo", "ok"], dependencies: [] }],
            tests: [],
            tasks: [],
            build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
          },
          build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
        },
        {
          name: "module-b",
          type: "test",
          path: join(garden.projectRoot, "module-b"),
          spec: {
            services: [{ name: "service-b", deployCommand: ["echo", "ok"], dependencies: ["service-a"] }],
            tests: [],
            tasks: [],
            build: { dependencies: ["module-a"], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
          },
          build: { dependencies: [{ name: "module-a", copy: [] }], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
        },
      ])

      const graph = await garden.getConfigGraph({ log, emit: false })

      await expectError(() => graph.getBuild("module-a"), { contains: "Could not find Build action module-a" })
      await expectError(() => graph.getBuild("module-b"), { contains: "Could not find Build action module-b" })

      const deployActionDeps = graph
        .getDeploy("service-b")
        .getDependencies()
        .map((dep) => dep.key())
        .sort()

      expect(deployActionDeps).to.eql(["deploy.service-a"])
      const warningMsgSnippet = deline`
        Action deploy.service-b depends on build.module-a (from module module-a of type test), which doesn't exist.
      `
      const expectedLog = log.root
        .getLogEntries()
        .filter((l) => stripAnsi(resolveMsg(l) || "").includes(warningMsgSnippet))
      expect(expectedLog.length).to.be.greaterThan(0)
    })
  })
})
