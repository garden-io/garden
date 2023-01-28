/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import { expect } from "chai"
import { ensureDir } from "fs-extra"
import {
  makeTestGardenA,
  makeTestGarden,
  expectError,
  makeTestModule,
  getDataDir,
  createProjectConfig,
  TestGarden,
  customizedTestPlugin,
} from "../../helpers"
import { getNames } from "../../../src/util/util"
import { ConfigGraph, ConfigGraphNode } from "../../../src/graph/config-graph"
import { Garden } from "../../../src/garden"
import { DEFAULT_API_VERSION, GARDEN_CORE_ROOT } from "../../../src/constants"
import tmp from "tmp-promise"
import execa from "execa"
import { GardenPlugin } from "../../../src/plugin/plugin"
import { ProjectConfig } from "../../../src/config/project"
import { ActionKind, BaseActionConfig } from "../../../src/actions/types"
import { joi } from "../../../src/config/common"

const makeAction = ({
  basePath,
  name,
  kind,
  spec,
  disabled,
}: {
  basePath: string
  name: string
  kind: ActionKind
  spec: any
  disabled: boolean
}): BaseActionConfig => ({
  apiVersion: DEFAULT_API_VERSION,
  kind,
  name,
  type: "test",
  disabled,
  internal: {
    basePath,
  },
  spec,
})

async function makeGarden(tmpDir: tmp.DirectoryResult, plugin: GardenPlugin) {
  const config: ProjectConfig = createProjectConfig({
    path: tmpDir.path,
    providers: [{ name: "test" }],
  })

  const garden = await TestGarden.factory(tmpDir.path, { config, plugins: [plugin] })
  return garden
}

/**
 * TODO-G2B:
 *  - implement the remained test cases similar to the existing module-based (getDependants* and getDependencies)
 *  - consider using template helper functions or parameteric tests for the similar Build/Deploy/Run/Test spec
 */
describe("ConfigGraph (action-based configs)", () => {
  let tmpDir: tmp.DirectoryResult
  let garden: TestGarden
  let configGraph: ConfigGraph

  // Minimalistic test plugin with no-op behaviour and without any schema validation constraints,
  // because we only need to unit test the processing of action configs into the action definitions.
  const testPlugin = customizedTestPlugin({
    name: "test",
    createActionTypes: {
      Build: [
        {
          name: "test",
          docs: "Test Build action",
          schema: joi.object(),
          handlers: {},
        },
      ],
      Deploy: [
        {
          name: "test",
          docs: "Test Deploy action",
          schema: joi.object(),
          handlers: {},
        },
      ],
      Run: [
        {
          name: "test",
          docs: "Test Run action",
          schema: joi.object(),
          handlers: {},
        },
      ],
      Test: [
        {
          name: "test",
          docs: "Test Test action",
          schema: joi.object(),
          handlers: {},
        },
      ],
    },
  })

  // Helpers to create minimalistic action configs.
  // Each action type has its own simple spec with a single field named `${lowercase(kind)}Command`.

  const _makeBuild = (name: string, disabled: boolean) =>
    makeAction({
      basePath: tmpDir.path,
      name,
      kind: "Build",
      spec: {
        buildCommand: ["echo", name, "ok"],
      },
      disabled,
    })
  const makeBuild = (name: string) => _makeBuild(name, false)
  const makeDisabledBuild = (name: string) => _makeBuild(name, true)

  const _makeDeploy = (name: string, disabled: boolean) =>
    makeAction({
      basePath: tmpDir.path,
      name,
      kind: "Deploy",
      spec: {
        deployCommand: ["echo", name, "ok"],
      },
      disabled,
    })
  const makeDeploy = (name: string) => _makeDeploy(name, false)
  const makeDisabledDeploy = (name: string) => _makeDeploy(name, true)

  const _makeRun = (name: string, disabled: boolean) =>
    makeAction({
      basePath: tmpDir.path,
      name,
      kind: "Run",
      spec: {
        runCommand: ["echo", name, "ok"],
      },
      disabled,
    })
  const makeRun = (name: string) => _makeRun(name, false)
  const makeDisabledRun = (name: string) => _makeRun(name, true)

  const _makeTest = (name: string, disabled: boolean) =>
    makeAction({
      basePath: tmpDir.path,
      name,
      kind: "Test",
      spec: {
        testCommand: ["echo", name, "ok"],
      },
      disabled,
    })
  const makeTest = (name: string) => _makeTest(name, false)
  const makeDisabledTest = (name: string) => _makeTest(name, true)

  before(async () => {
    tmpDir = await tmp.dir({ unsafeCleanup: true })
    await execa("git", ["init", "--initial-branch=main"], { cwd: tmpDir.path })

    // init Garden and some actions of each kind
    garden = await makeGarden(tmpDir, testPlugin)
    const validActionConfigs: BaseActionConfig[] = [
      makeBuild("build-1"),
      makeBuild("build-2"),
      makeBuild("build-3"),
      makeDeploy("deploy-1"),
      makeDeploy("deploy-2"),
      makeDeploy("deploy-3"),
      makeRun("run-1"),
      makeRun("run-2"),
      makeRun("run-3"),
      makeTest("test-1"),
      makeTest("test-2"),
      makeTest("test-3"),
    ]
    garden.setActionConfigs([], [...validActionConfigs])
    configGraph = await garden.getConfigGraph({ log: garden.log, emit: false })
  })

  after(async () => {
    await tmpDir.cleanup()
  })

  describe("getActionsByKind", () => {
    describe("getBuilds", () => {
      it("should return all registered Build actions", async () => {
        const buildActions = configGraph.getBuilds()

        expect(getNames(buildActions).sort()).to.eql(["build-1", "build-2", "build-3"])

        const spec1 = buildActions[0].getConfig("spec")
        expect(spec1.buildCommand).to.eql(["echo", "build-1", "ok"])

        const spec2 = buildActions[1].getConfig("spec")
        expect(spec2.buildCommand).to.eql(["echo", "build-2", "ok"])

        const spec3 = buildActions[2].getConfig("spec")
        expect(spec3.buildCommand).to.eql(["echo", "build-3", "ok"])
      })

      it("should optionally return specified Build actions in the context", async () => {
        const buildActions = configGraph.getBuilds({ names: ["build-1", "build-2"] })

        expect(getNames(buildActions).sort()).to.eql(["build-1", "build-2"])
      })

      it("should omit disabled Build actions", async () => {
        const tmpGarden = await makeGarden(tmpDir, testPlugin)

        tmpGarden.setActionConfigs([], [makeDisabledBuild("disabled-build")])

        const graph = await tmpGarden.getConfigGraph({ log: tmpGarden.log, emit: false })
        const buildActions = graph.getBuilds()

        expect(buildActions).to.eql([])
      })

      it("should optionally include disabled Build actions", async () => {
        const tmpGarden = await makeGarden(tmpDir, testPlugin)

        tmpGarden.setActionConfigs([], [makeDisabledBuild("disabled-build")])

        const graph = await tmpGarden.getConfigGraph({ log: tmpGarden.log, emit: false })
        const disabledBuildActions = graph.getBuilds({ includeDisabled: true })

        expect(getNames(disabledBuildActions).sort()).to.eql(["disabled-build"])
      })

      it("should throw if named Build action is missing", async () => {
        try {
          configGraph.getBuilds({ names: ["missing-build"] })
        } catch (err) {
          expect(err.type).to.equal("graph")
          return
        }

        throw new Error("Expected error")
      })

      it("should throw if specifically requesting a disabled Build action", async () => {
        const tmpGarden = await makeGarden(tmpDir, testPlugin)

        tmpGarden.setActionConfigs([], [makeDisabledBuild("disabled-build")])

        const graph = await tmpGarden.getConfigGraph({ log: tmpGarden.log, emit: false })

        await expectError(() => graph.getBuilds({ names: ["disabled-build"] }), {
          contains: "Could not find one or more Build actions: disabled-build",
        })
      })
    })

    describe("getDeploys", () => {
      it("should return all registered Deploy actions", async () => {
        const deployActions = configGraph.getDeploys()

        expect(getNames(deployActions).sort()).to.eql(["deploy-1", "deploy-2", "deploy-3"])

        const spec1 = deployActions[0].getConfig("spec")
        expect(spec1.deployCommand).to.eql(["echo", "deploy-1", "ok"])

        const spec2 = deployActions[1].getConfig("spec")
        expect(spec2.deployCommand).to.eql(["echo", "deploy-2", "ok"])

        const spec3 = deployActions[2].getConfig("spec")
        expect(spec3.deployCommand).to.eql(["echo", "deploy-3", "ok"])
      })

      it("should optionally return specified Deploy actions in the context", async () => {
        const deployActions = configGraph.getDeploys({ names: ["deploy-1", "deploy-2"] })

        expect(getNames(deployActions).sort()).to.eql(["deploy-1", "deploy-2"])
      })

      it("should omit disabled Deploy actions", async () => {
        const tmpGarden = await makeGarden(tmpDir, testPlugin)

        tmpGarden.setActionConfigs([], [makeDisabledDeploy("disabled-deploy")])

        const graph = await tmpGarden.getConfigGraph({ log: tmpGarden.log, emit: false })
        const deployActions = graph.getDeploys()

        expect(deployActions).to.eql([])
      })

      it("should optionally include disabled Deploy actions", async () => {
        const tmpGarden = await makeGarden(tmpDir, testPlugin)

        tmpGarden.setActionConfigs([], [makeDisabledDeploy("disabled-deploy")])

        const graph = await tmpGarden.getConfigGraph({ log: tmpGarden.log, emit: false })
        const disabledDeployActions = graph.getDeploys({ includeDisabled: true })

        expect(getNames(disabledDeployActions).sort()).to.eql(["disabled-deploy"])
      })

      it("should throw if named Deploy action is missing", async () => {
        try {
          configGraph.getDeploys({ names: ["missing-deploy"] })
        } catch (err) {
          expect(err.type).to.equal("graph")
          return
        }

        throw new Error("Expected error")
      })

      it("should throw if specifically requesting a disabled Deploy action", async () => {
        const tmpGarden = await makeGarden(tmpDir, testPlugin)

        tmpGarden.setActionConfigs([], [makeDisabledDeploy("disabled-deploy")])

        const graph = await tmpGarden.getConfigGraph({ log: tmpGarden.log, emit: false })

        await expectError(() => graph.getDeploys({ names: ["disabled-deploy"] }), {
          contains: "Could not find one or more Deploy actions: disabled-deploy",
        })
      })
    })

    describe("getRuns", () => {
      it("should return all registered Run actions", async () => {
        const runActions = configGraph.getRuns()

        expect(getNames(runActions).sort()).to.eql(["run-1", "run-2", "run-3"])

        const spec1 = runActions[0].getConfig("spec")
        expect(spec1.runCommand).to.eql(["echo", "run-1", "ok"])

        const spec2 = runActions[1].getConfig("spec")
        expect(spec2.runCommand).to.eql(["echo", "run-2", "ok"])

        const spec3 = runActions[2].getConfig("spec")
        expect(spec3.runCommand).to.eql(["echo", "run-3", "ok"])
      })

      it("should optionally return specified Run actions in the context", async () => {
        const runActions = configGraph.getRuns({ names: ["run-1", "run-2"] })

        expect(getNames(runActions).sort()).to.eql(["run-1", "run-2"])
      })

      it("should omit disabled Run actions", async () => {
        const tmpGarden = await makeGarden(tmpDir, testPlugin)

        tmpGarden.setActionConfigs([], [makeDisabledRun("disabled-run")])

        const graph = await tmpGarden.getConfigGraph({ log: tmpGarden.log, emit: false })
        const runActions = graph.getRuns()

        expect(runActions).to.eql([])
      })

      it("should optionally include disabled Run actions", async () => {
        const tmpGarden = await makeGarden(tmpDir, testPlugin)

        tmpGarden.setActionConfigs([], [makeDisabledRun("disabled-run")])

        const graph = await tmpGarden.getConfigGraph({ log: tmpGarden.log, emit: false })
        const disabledRunActions = graph.getRuns({ includeDisabled: true })

        expect(getNames(disabledRunActions).sort()).to.eql(["disabled-run"])
      })

      it("should throw if named Run action is missing", async () => {
        try {
          configGraph.getRuns({ names: ["missing-run"] })
        } catch (err) {
          expect(err.type).to.equal("graph")
          return
        }

        throw new Error("Expected error")
      })

      it("should throw if specifically requesting a disabled Run action", async () => {
        const tmpGarden = await makeGarden(tmpDir, testPlugin)

        tmpGarden.setActionConfigs([], [makeDisabledRun("disabled-run")])

        const graph = await tmpGarden.getConfigGraph({ log: tmpGarden.log, emit: false })

        await expectError(() => graph.getRuns({ names: ["disabled-run"] }), {
          contains: "Could not find one or more Run actions: disabled-run",
        })
      })
    })

    describe("getTests", () => {
      it("should return all registered Test actions", async () => {
        const testActions = configGraph.getTests()

        expect(getNames(testActions).sort()).to.eql(["test-1", "test-2", "test-3"])

        const spec1 = testActions[0].getConfig("spec")
        expect(spec1.testCommand).to.eql(["echo", "test-1", "ok"])

        const spec2 = testActions[1].getConfig("spec")
        expect(spec2.testCommand).to.eql(["echo", "test-2", "ok"])

        const spec3 = testActions[2].getConfig("spec")
        expect(spec3.testCommand).to.eql(["echo", "test-3", "ok"])
      })

      it("should optionally return specified Test actions in the context", async () => {
        const testActions = configGraph.getTests({ names: ["test-1", "test-2"] })

        expect(getNames(testActions).sort()).to.eql(["test-1", "test-2"])
      })

      it("should omit disabled Test actions", async () => {
        const tmpGarden = await makeGarden(tmpDir, testPlugin)

        tmpGarden.setActionConfigs([], [makeDisabledTest("disabled-test")])

        const graph = await tmpGarden.getConfigGraph({ log: tmpGarden.log, emit: false })
        const testActions = graph.getTests()

        expect(testActions).to.eql([])
      })

      it("should optionally include disabled Test actions", async () => {
        const tmpGarden = await makeGarden(tmpDir, testPlugin)

        tmpGarden.setActionConfigs([], [makeDisabledTest("disabled-test")])

        const graph = await tmpGarden.getConfigGraph({ log: tmpGarden.log, emit: false })
        const disabledTestActions = graph.getTests({ includeDisabled: true })

        expect(getNames(disabledTestActions).sort()).to.eql(["disabled-test"])
      })

      it("should throw if named Test action is missing", async () => {
        try {
          configGraph.getTests({ names: ["missing-test"] })
        } catch (err) {
          expect(err.type).to.equal("graph")
          return
        }

        throw new Error("Expected error")
      })

      it("should throw if specifically requesting a disabled Test action", async () => {
        const tmpGarden = await makeGarden(tmpDir, testPlugin)

        tmpGarden.setActionConfigs([], [makeDisabledTest("disabled-test")])

        const graph = await tmpGarden.getConfigGraph({ log: tmpGarden.log, emit: false })

        await expectError(() => graph.getTests({ names: ["disabled-test"] }), {
          contains: "Could not find one or more Test actions: disabled-test",
        })
      })
    })
  })

  describe("getActionByKind", () => {
    describe("getBuild", () => {
      it("should return the specified Build action", async () => {
        const buildAction = configGraph.getBuild("build-1")

        expect(buildAction.name).to.equal("build-1")

        const spec = buildAction.getConfig("spec")
        expect(spec.buildCommand).to.eql(["echo", "build-1", "ok"])
      })

      it("should throw if Build action is missing", async () => {
        try {
          configGraph.getBuild("missing-build")
        } catch (err) {
          expect(err.type).to.equal("graph")
          return
        }

        throw new Error("Expected error")
      })
    })

    describe("getDeploy", () => {
      it("should return the specified Deploy action", async () => {
        const deployAction = configGraph.getDeploy("deploy-1")

        expect(deployAction.name).to.equal("deploy-1")

        const spec = deployAction.getConfig("spec")
        expect(spec.deployCommand).to.eql(["echo", "deploy-1", "ok"])
      })

      it("should throw if Deploy action is missing", async () => {
        try {
          configGraph.getDeploy("missing-deploy")
        } catch (err) {
          expect(err.type).to.equal("graph")
          return
        }

        throw new Error("Expected error")
      })
    })

    describe("getRun", () => {
      it("should return the specified Run action", async () => {
        const runAction = configGraph.getRun("run-1")

        expect(runAction.name).to.equal("run-1")

        const spec = runAction.getConfig("spec")
        expect(spec.runCommand).to.eql(["echo", "run-1", "ok"])
      })

      it("should throw if Run action is missing", async () => {
        try {
          configGraph.getRun("missing-run")
        } catch (err) {
          expect(err.type).to.equal("graph")
          return
        }

        throw new Error("Expected error")
      })
    })

    describe("getTest", () => {
      it("should return the specified Test action", async () => {
        const testAction = configGraph.getTest("test-1")

        expect(testAction.name).to.equal("test-1")

        const spec = testAction.getConfig("spec")
        expect(spec.testCommand).to.eql(["echo", "test-1", "ok"])
      })

      it("should throw if Test action is missing", async () => {
        try {
          configGraph.getTest("missing-test")
        } catch (err) {
          expect(err.type).to.equal("graph")
          return
        }

        throw new Error("Expected error")
      })
    })
  })
})

describe("ConfigGraph (module-based configs)", () => {
  let gardenA: Garden
  let graphA: ConfigGraph
  let tmpPath: string

  before(async () => {
    gardenA = await makeTestGardenA()
    graphA = await gardenA.getConfigGraph({ log: gardenA.log, emit: false })
    tmpPath = join(GARDEN_CORE_ROOT, "tmp")
    await ensureDir(tmpPath)
  })

  it("should throw when two deploy actions have the same name", async () => {
    const garden = await makeTestGarden(getDataDir("test-projects", "duplicate-service"))

    await expectError(() => garden.getConfigGraph({ log: garden.log, emit: false }), {
      contains:
        "Service names must be unique - the service name 'dupe' is declared multiple times (in modules 'module-a' and 'module-b')",
    })
  })

  it("should throw when two run actions have the same name", async () => {
    const garden = await makeTestGarden(getDataDir("test-projects", "duplicate-task"))

    await expectError(() => garden.getConfigGraph({ log: garden.log, emit: false }), {
      contains:
        "Task names must be unique - the task name 'dupe' is declared multiple times (in modules 'module-a' and 'module-b')",
    })
  })

  it("should throw when a deploy and a run actions have the same name", async () => {
    const garden = await makeTestGarden(getDataDir("test-projects", "duplicate-service-and-task"))

    await expectError(() => garden.getConfigGraph({ log: garden.log, emit: false }), {
      contains:
        "Service and task names must be mutually unique - the name 'dupe' is used for a task in 'module-b' and for a service in 'module-a'",
    })
  })

  it("should automatically add service source modules as module build dependencies", async () => {
    const garden = await makeTestGarden(getDataDir("test-projects", "source-module"))
    const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    const module = graph.getModule("module-b")
    expect(module.build.dependencies).to.eql([{ name: "module-a", copy: [] }])
  })

  describe("getActions", () => {
    it("returns all actions in graph", () => {
      const actions = graphA.getActions()
      expect(actions.map((a) => a.key()).sort()).to.eql([
        "build.module-a",
        "build.module-b",
        "build.module-c",
        "deploy.service-a",
        "deploy.service-b",
        "deploy.service-c",
        "run.task-a",
        "run.task-a2",
        "run.task-b",
        "run.task-c",
        "test.module-a-integration",
        "test.module-a-unit",
        "test.module-b-unit",
        "test.module-c-integ",
        "test.module-c-unit",
      ])
    })

    it("returns actions matching the given references", () => {
      const actions = graphA.getActions({
        refs: [
          { kind: "Build", name: "module-a" },
          { kind: "Run", name: "task-c" },
        ],
      })
      expect(actions.map((a) => a.key()).sort()).to.eql(["build.module-a", "run.task-c"])
    })
  })

  describe("getModules", () => {
    it("should scan and return all registered modules in the context", async () => {
      const modules = graphA.getModules()
      expect(getNames(modules).sort()).to.eql(["module-a", "module-b", "module-c"])
    })

    it("should optionally return specified modules in the context", async () => {
      const modules = graphA.getModules({ names: ["module-b", "module-c"] })
      expect(getNames(modules).sort()).to.eql(["module-b", "module-c"])
    })

    it("should omit disabled modules", async () => {
      const garden = await makeTestGardenA()

      await garden.scanAndAddConfigs()
      garden["moduleConfigs"]["module-c"].disabled = true

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const modules = graph.getModules()

      expect(getNames(modules).sort()).to.eql(["module-a", "module-b"])
    })

    it("should optionally include disabled modules", async () => {
      const garden = await makeTestGardenA()

      await garden.scanAndAddConfigs()
      garden["moduleConfigs"]["module-c"].disabled = true

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const modules = graph.getModules({ includeDisabled: true })

      expect(getNames(modules).sort()).to.eql(["module-a", "module-b", "module-c"])
    })

    it("should throw if specifically requesting a disabled module", async () => {
      const garden = await makeTestGardenA()

      await garden.scanAndAddConfigs()
      garden["moduleConfigs"]["module-c"].disabled = true

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })

      await expectError(() => graph.getModules({ names: ["module-c"] }), {
        contains: "Could not find module(s): module-c",
      })
    })

    it("should throw if named module is missing", async () => {
      try {
        graphA.getModules({ names: ["bla"] })
      } catch (err) {
        expect(err.type).to.equal("parameter")
        return
      }

      throw new Error("Expected error")
    })

    it("should throw if a build dependency is missing", async () => {
      const garden = await makeTestGardenA()

      garden.setActionConfigs([
        makeTestModule({
          name: "test",
          path: tmpPath,
          build: {
            dependencies: [{ name: "missing-build-dep", copy: [] }],
          },
        }),
      ])

      await expectError(() => garden.getConfigGraph({ log: garden.log, emit: false }), {
        contains: "Could not find build dependency missing-build-dep, configured in module test",
      })
    })

    it("should throw if a runtime dependency is missing", async () => {
      const garden = await makeTestGardenA()

      garden.setActionConfigs([
        makeTestModule({
          name: "test",
          path: tmpPath,
          spec: {
            services: [
              {
                name: "test-service",
                dependencies: ["missing-runtime-dep"],
                disabled: false,

                spec: {},
              },
            ],
          },
        }),
      ])

      await expectError(() => garden.getConfigGraph({ log: garden.log, emit: false }), {
        contains: "Unknown service or task 'missing-runtime-dep' referenced in dependencies",
      })
    })
  })

  describe("getDeploys", () => {
    it("should scan for modules and return all registered deploys in the context", async () => {
      const deploys = graphA.getDeploys()

      expect(getNames(deploys).sort()).to.eql(["service-a", "service-b", "service-c"])
    })

    it("should optionally return specified deploys in the context", async () => {
      const deploys = graphA.getDeploys({ names: ["service-b", "service-c"] })

      expect(getNames(deploys).sort()).to.eql(["service-b", "service-c"])
    })

    it("should omit disabled deploys", async () => {
      const garden = await makeTestGardenA()

      garden.setActionConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          name: "foo",
          path: tmpPath,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {
            services: [
              {
                name: "disabled-service",
                dependencies: [],
                disabled: true,

                spec: {},
              },
            ],
          },
          testConfigs: [],
          type: "test",
        },
      ])

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const deps = graph.getDeploys()

      expect(deps).to.eql([])
    })

    it("should optionally include disabled deploys", async () => {
      const garden = await makeTestGardenA()

      garden.setActionConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          name: "foo",
          path: tmpPath,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {
            services: [
              {
                name: "disabled-service",
                dependencies: [],
                disabled: true,

                spec: {},
              },
            ],
          },
          testConfigs: [],
          type: "test",
        },
      ])

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const deploys = graph.getDeploys({ includeDisabled: true })

      expect(getNames(deploys)).to.eql(["disabled-service"])
    })

    it("should throw if specifically requesting a disabled deploy", async () => {
      const garden = await makeTestGardenA()

      garden.setActionConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          name: "foo",
          path: tmpPath,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {
            services: [
              {
                name: "service-a",
                dependencies: [],
                disabled: true,

                spec: {},
              },
            ],
          },
          testConfigs: [],
          type: "test",
        },
      ])

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })

      await expectError(() => graph.getDeploys({ names: ["service-a"] }), {
        contains: "Could not find one or more Deploy actions: service-a",
      })
    })

    it("should throw if named deploy is missing", async () => {
      try {
        graphA.getDeploys({ names: ["bla"] })
      } catch (err) {
        expect(err.type).to.equal("graph")
        return
      }

      throw new Error("Expected error")
    })
  })

  describe("getDeploy", () => {
    it("should return the specified deploy", async () => {
      const deploy = graphA.getDeploy("service-b")

      expect(deploy.name).to.equal("service-b")
    })

    it("should throw if deploy is missing", async () => {
      try {
        graphA.getDeploy("bla")
      } catch (err) {
        expect(err.type).to.equal("graph")
        return
      }

      throw new Error("Expected error")
    })
  })

  describe("getRuns", () => {
    it("should scan for modules and return all registered runs in the context", async () => {
      const runs = graphA.getRuns()
      expect(getNames(runs).sort()).to.eql(["task-a", "task-a2", "task-b", "task-c"])
    })

    it("should optionally return specified runs in the context", async () => {
      const runs = graphA.getRuns({ names: ["task-b", "task-c"] })
      expect(getNames(runs).sort()).to.eql(["task-b", "task-c"])
    })

    it("should omit disabled runs", async () => {
      const garden = await makeTestGardenA()

      garden.setActionConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          name: "foo",
          path: tmpPath,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {
            tasks: [
              {
                name: "disabled-task",
                command: ["echo", "ok"],
                dependencies: [],
                disabled: true,
              },
            ],
          },
          testConfigs: [],
          type: "test",
        },
      ])

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const deps = graph.getRuns()

      expect(deps).to.eql([])
    })

    it("should optionally include disabled runs", async () => {
      const garden = await makeTestGardenA()

      garden.setActionConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          name: "foo",
          path: tmpPath,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {
            tasks: [
              {
                name: "disabled-task",
                command: ["echo", "ok"],
                dependencies: [],
                disabled: true,
              },
            ],
          },
          testConfigs: [],
          type: "test",
        },
      ])

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const runs = graph.getRuns({ includeDisabled: true })

      expect(getNames(runs)).to.eql(["disabled-task"])
    })

    it("should throw if specifically requesting a disabled run", async () => {
      const garden = await makeTestGardenA()

      garden.setActionConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          name: "foo",
          path: tmpPath,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {
            tasks: [
              {
                name: "disabled-task",
                command: ["echo", "ok"],
                dependencies: [],
                disabled: true,
              },
            ],
          },
          testConfigs: [],
          type: "test",
        },
      ])

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })

      await expectError(() => graph.getRuns({ names: ["disabled-task"] }), {
        contains: "Could not find one or more Run actions: disabled-task",
      })
    })

    it("should throw if named run is missing", async () => {
      try {
        graphA.getRuns({ names: ["bla"] })
      } catch (err) {
        expect(err.type).to.equal("graph")
        return
      }

      throw new Error("Expected error")
    })
  })

  describe("getRun", () => {
    it("should return the specified run", async () => {
      const run = graphA.getRun("task-b")

      expect(run.name).to.equal("task-b")
    })

    it("should throw if run is missing", async () => {
      try {
        graphA.getRun("bla")
      } catch (err) {
        expect(err.type).to.equal("graph")
        return
      }

      throw new Error("Expected error")
    })
  })

  describe("getDependencies", () => {
    it("should include disabled modules in build dependencies", async () => {
      const garden = await makeTestGardenA()

      // FIXME: find a proper way of refreshing module configs programmatically.
      //  With the configs below, function convertModules(...) from convert-modules.ts loses the build actions info
      //  when its' called from Garden.getConfigGraph(...)
      garden.setActionConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          kind: "Module",
          allowPublish: false,
          build: { dependencies: [] },
          disabled: true,
          name: "module-a",
          include: [],
          path: tmpPath,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {},
          testConfigs: [],
          type: "test",
        },
        {
          apiVersion: DEFAULT_API_VERSION,
          kind: "Module",
          allowPublish: false,
          build: { dependencies: [{ name: "module-a", copy: [] }] },
          disabled: false,
          name: "module-b",
          include: [],
          path: tmpPath,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {},
          testConfigs: [],
          type: "test",
        },
      ])

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })

      const deps = graph.getDependencies({
        kind: "Build",
        name: "module-b",
        recursive: false,
      })

      const buildDeps = deps.filter((d) => d.kind === "Build")
      expect(getNames(buildDeps)).to.eql(["module-a"])
    })

    it("should ignore dependencies by deploys on disabled deploys", async () => {
      const garden = await makeTestGardenA()

      garden.setActionConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          name: "foo",
          path: tmpPath,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {
            services: [
              {
                name: "disabled-service",
                dependencies: [],
                disabled: true,
              },
              {
                name: "enabled-service",
                dependencies: ["disabled-service"],
                disabled: true,
              },
            ],
          },
          testConfigs: [],
          type: "test",
        },
      ])

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })

      const deps = graph.getDependencies({
        kind: "Deploy",
        name: "enabled-service",
        recursive: false,
      })

      const deployDeps = deps.filter((d) => d.kind === "Deploy")
      expect(deployDeps).to.eql([])
    })

    it("should ignore dependencies by deploys on disabled runs", async () => {
      const garden = await makeTestGardenA()

      garden.setActionConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          name: "foo",
          path: tmpPath,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {
            services: [
              {
                name: "enabled-service",
                dependencies: ["disabled-task"],
                disabled: false,
              },
            ],
            tasks: [
              {
                name: "disabled-task",
                command: ["echo", "ok"],
                dependencies: [],
                disabled: true,
              },
            ],
          },
          testConfigs: [],
          type: "test",
        },
      ])

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })

      const deps = graph.getDependencies({
        kind: "Deploy",
        name: "enabled-service",
        recursive: false,
      })

      const runDeps = deps.filter((d) => d.kind === "Run")
      expect(runDeps).to.eql([])
    })

    it("should ignore dependencies by deploys on deploys in disabled modules", async () => {
      const garden = await makeTestGardenA()

      garden.setActionConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          name: "module-a",
          include: [],
          path: tmpPath,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {
            services: [
              {
                name: "disabled-service",
                dependencies: [],
                disabled: true,
              },
            ],
          },
          testConfigs: [],
          type: "test",
        },
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          name: "module-b",
          include: [],
          path: tmpPath,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {
            services: [
              {
                name: "enabled-service",
                dependencies: ["disabled-service"],
                disabled: false,
              },
            ],
          },
          testConfigs: [],
          type: "test",
        },
      ])

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })

      const deps = graph.getDependencies({
        kind: "Deploy",
        name: "enabled-service",
        recursive: false,
      })

      const deployDeps = deps.filter((d) => d.kind === "Deploy")
      expect(deployDeps).to.eql([])
    })

    it("should ignore dependencies by runs on disabled deploys", async () => {
      const garden = await makeTestGardenA()

      garden.setActionConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          name: "foo",
          path: tmpPath,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {
            services: [
              {
                name: "disabled-service",
                dependencies: [],
                disabled: true,
              },
            ],
            tasks: [
              {
                name: "enabled-task",
                command: ["echo", "ok"],
                dependencies: ["disabled-service"],
                disabled: false,
              },
            ],
          },
          testConfigs: [],
          type: "test",
        },
      ])

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })

      const deps = graph.getDependencies({
        kind: "Deploy",
        name: "enabled-task",
        recursive: false,
      })

      const deployDeps = deps.filter((d) => d.kind === "Deploy")
      expect(deployDeps).to.eql([])
    })

    it("should ignore dependencies by tests on disabled deploys", async () => {
      const garden = await makeTestGardenA()

      garden.setActionConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          name: "foo",
          path: tmpPath,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {
            services: [
              {
                name: "disabled-service",
                dependencies: [],
                disabled: true,
              },
            ],
            tests: [
              {
                name: "enabled-test",
                command: ["echo", "ok"],
                dependencies: ["disabled-service"],
                disabled: false,
              },
            ],
          },
          testConfigs: [],
          type: "test",
        },
      ])

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })

      const deps = graph.getDependencies({
        kind: "Deploy",
        name: "enabled-test",
        recursive: false,
      })

      const deployDeps = deps.filter((d) => d.kind === "Deploy")
      expect(deployDeps).to.eql([])
    })
  })

  describe("resolveDependencyModules", () => {
    it("should include disabled modules in build dependencies", async () => {
      const garden = await makeTestGardenA()

      garden.setActionConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: true,
          name: "module-a",
          include: [],
          path: tmpPath,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {},
          testConfigs: [],
          type: "test",
        },
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          name: "module-b",
          include: [],
          path: tmpPath,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {},
          testConfigs: [],
          type: "test",
        },
      ])

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const deps = graph.moduleGraph.resolveDependencyModules([{ name: "module-a", copy: [] }], [])

      expect(getNames(deps)).to.eql(["module-a"])
    })
  })

  describe("getDependants", () => {
    it("should not traverse past disabled deploys", async () => {
      const garden = await makeTestGardenA()

      garden.setActionConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          name: "module-a",
          include: [],
          path: tmpPath,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {
            services: [
              {
                name: "service-a",
                dependencies: [],
                disabled: true,
              },
            ],
          },
          testConfigs: [],
          type: "test",
        },
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          name: "module-b",
          include: [],
          path: tmpPath,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {
            services: [
              {
                name: "service-b",
                dependencies: ["service-a"],
                disabled: false,
              },
            ],
          },
          testConfigs: [],
          type: "test",
        },
      ])

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const deps = graph.getDependants({ kind: "Build", name: "module-a", recursive: true })

      const deployDeps = deps.filter((d) => d.kind === "Deploy")
      expect(deployDeps).to.eql([])
    })
  })

  describe("getDependantsForModule", () => {
    it("should return deploys and runs for a build dependant of the given module", async () => {
      const garden = await makeTestGardenA()

      garden.setActionConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          name: "module-a",
          include: [],
          path: tmpPath,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {},
          testConfigs: [],
          type: "test",
        },
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [{ name: "module-a", copy: [] }] },
          disabled: false,
          name: "module-b",
          include: [],
          path: tmpPath,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {
            services: [
              {
                name: "service-b",
                dependencies: [],
                disabled: false,
              },
            ],
            tasks: [
              {
                name: "task-b",
                command: ["echo", "ok"],
                dependencies: [],
                disabled: false,
              },
            ],
          },
          testConfigs: [],
          type: "test",
        },
      ])

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const moduleA = graph.getModule("module-a")
      const deps = graph.moduleGraph.getDependantsForModule(moduleA, true)

      expect(getNames(deps.deploy)).to.eql(["service-b"])
      expect(getNames(deps.run)).to.eql(["task-b"])
    })
  })

  describe("resolveDependencyModules", () => {
    it("should resolve build dependencies", async () => {
      const modules = graphA.moduleGraph.resolveDependencyModules([{ name: "module-c", copy: [] }], [])
      expect(getNames(modules)).to.eql(["module-a", "module-b", "module-c"])
    })

    it("should resolve deploy dependencies", async () => {
      const modules = graphA.moduleGraph.resolveDependencyModules([], ["service-b"])
      expect(getNames(modules)).to.eql(["module-a", "module-b"])
    })

    it("should combine module and deploy dependencies", async () => {
      const modules = graphA.moduleGraph.resolveDependencyModules([{ name: "module-b", copy: [] }], ["service-c"])
      expect(getNames(modules)).to.eql(["module-a", "module-b", "module-c"])
    })
  })

  describe("render", () => {
    it("should render config graph nodes with test names", () => {
      const rendered = graphA.render()
      expect(rendered.nodes).to.include.deep.members([
        {
          kind: "Build",
          name: "module-a",
          key: "module-a",
          disabled: false,
        },
        {
          kind: "Build",
          name: "module-b",
          key: "module-b",
          disabled: false,
        },
        {
          kind: "Build",
          name: "module-c",
          key: "module-c",
          disabled: false,
        },
        {
          kind: "Test",
          name: "module-c-unit",
          key: "module-c-unit",
          disabled: false,
        },
        {
          kind: "Test",
          name: "module-c-integ",
          key: "module-c-integ",
          disabled: false,
        },
        {
          kind: "Run",
          name: "task-c",
          key: "task-c",
          disabled: false,
        },
        {
          kind: "Deploy",
          name: "service-c",
          key: "service-c",
          disabled: false,
        },
        {
          kind: "Test",
          name: "module-a-unit",
          key: "module-a-unit",
          disabled: false,
        },
        {
          kind: "Test",
          name: "module-a-integration",
          key: "module-a-integration",
          disabled: false,
        },
        {
          kind: "Run",
          name: "task-a",
          key: "task-a",
          disabled: false,
        },
        {
          kind: "Test",
          name: "module-b-unit",
          key: "module-b-unit",
          disabled: false,
        },
        {
          kind: "Run",
          name: "task-b",
          key: "task-b",
          disabled: false,
        },
        {
          kind: "Deploy",
          name: "service-a",
          key: "service-a",
          disabled: false,
        },
        {
          kind: "Deploy",
          name: "service-b",
          key: "service-b",
          disabled: false,
        },
      ])
    })
  })
})

describe("ConfigGraphNode", () => {
  describe("render", () => {
    it("should render a build node", () => {
      const node = new ConfigGraphNode("Build", "module-a", false)
      const res = node.render()
      expect(res).to.eql({
        kind: "Build",
        name: "module-a",
        key: "module-a",
        disabled: false,
      })
    })

    it("should render a deploy node", () => {
      const node = new ConfigGraphNode("Deploy", "service-a", false)
      const res = node.render()
      expect(res).to.eql({
        kind: "Deploy",
        name: "service-a",
        key: "service-a",
        disabled: false,
      })
    })

    it("should render a run node", () => {
      const node = new ConfigGraphNode("Run", "task-a", false)
      const res = node.render()
      expect(res).to.eql({
        kind: "Run",
        name: "task-a",
        key: "task-a",
        disabled: false,
      })
    })

    it("should render a test node", () => {
      const node = new ConfigGraphNode("Test", "module-a.test-a", false)
      const res = node.render()
      expect(res).to.eql({
        kind: "Test",
        name: "module-a.test-a",
        key: "module-a.test-a",
        disabled: false,
      })
    })

    it("should indicate if the node is disabled", () => {
      const node = new ConfigGraphNode("Test", "module-a.test-a", true)
      const res = node.render()
      expect(res).to.eql({
        kind: "Test",
        name: "module-a.test-a",
        key: "module-a.test-a",
        disabled: true,
      })
    })
  })
})
