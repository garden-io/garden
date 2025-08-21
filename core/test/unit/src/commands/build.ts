/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BuildCommand } from "../../../../src/commands/build.js"
import { expect } from "chai"
import {
  getAllProcessedTaskNames,
  makeModuleConfig,
  makeTestGarden,
  makeTestGardenA,
  makeTestGardenBuildDependants,
  projectRootBuildDependants,
  testProjectTempDirs,
  withDefaultGlobalOpts,
} from "../../../helpers.js"
import { taskResultOutputs, getAllTaskResults } from "../../../helpers.js"
import type { ModuleConfig } from "../../../../src/config/module.js"
import type { Log } from "../../../../src/logger/log-entry.js"
import fsExtra from "fs-extra"

const { writeFile } = fsExtra
import { join } from "path"
import type { ProcessCommandResult } from "../../../../src/commands/base.js"
import { nodeKey } from "../../../../src/graph/modules.js"
import { gardenEnv } from "../../../../src/constants.js"

describe("BuildCommand", () => {
  it("should build everything in a project and output the results", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const command = new BuildCommand()

    const { result } = await command.action({
      garden,
      log,
      args: { names: undefined },
      opts: withDefaultGlobalOpts({ "watch": false, "force": true, "with-dependants": false }),
    })

    expect(command.outputsSchema().validate(result).error).to.be.undefined

    const graph = await garden.getResolvedConfigGraph({ log, emit: false })

    const versionA = graph.getBuild("module-a").versionString(log)
    const versionB = graph.getBuild("module-b").versionString(log)
    const versionC = graph.getBuild("module-c").versionString(log)

    // TODO-G2B: think about a way to use type-safe values in taskOutputResults
    const taskOutputResults = taskResultOutputs(result!)
    expect(taskOutputResults).to.eql({
      "build.module-a": {
        state: "ready",
        outputs: {
          log: "A",
          stdout: "A",
          stderr: "",
        },
        detail: { fresh: true, buildLog: "A" },
        version: versionA,
      },
      "build.module-b": {
        state: "ready",
        outputs: {
          log: "B",
          stdout: "B",
          stderr: "",
        },
        detail: { fresh: true, buildLog: "B" },
        version: versionB,
      },
      "build.module-c": {
        state: "ready",
        outputs: {},
        detail: {},
        version: versionC,
      },
    })

    function getBuildResultVersion(r: ProcessCommandResult, name: string): string {
      const buildActionResults = r!.graphResults
      const key = nodeKey("build", name)
      const buildResult = buildActionResults[key]
      // Note: We assume the input version exists since we're not currently testing missing dependencies
      // in this test suite.
      return buildResult!.inputVersion!
    }

    const buildModuleAVersion = getBuildResultVersion(result!, "module-a")
    const buildModuleBVersion = getBuildResultVersion(result!, "module-b")
    const buildModuleCVersion = getBuildResultVersion(result!, "module-c")

    expect(buildModuleAVersion).to.eql(versionA)
    expect(buildModuleBVersion).to.eql(versionB)
    expect(buildModuleCVersion).to.eql(versionC)
  })

  it("should optionally run single build and its dependencies", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const command = new BuildCommand()

    const { result } = await command.action({
      garden,
      log,
      args: { names: ["module-b"] },
      opts: withDefaultGlobalOpts({ "watch": false, "force": true, "with-dependants": false }),
    })

    const taskOutputResults = taskResultOutputs(result!)
    expect(taskOutputResults["build.module-b"].state).to.equal("ready")
  })

  context("GARDEN_ENABLE_PARTIAL_RESOLUTION=true", () => {
    const originalValue = gardenEnv.GARDEN_ENABLE_PARTIAL_RESOLUTION

    before(() => {
      gardenEnv.GARDEN_ENABLE_PARTIAL_RESOLUTION = true
    })

    after(() => {
      gardenEnv.GARDEN_ENABLE_PARTIAL_RESOLUTION = originalValue
    })

    it("should optionally build and deploy single service and its dependencies", async () => {
      const garden = await makeTestGardenA([], { noCache: true })
      const log = garden.log
      const command = new BuildCommand()

      const { result, errors } = await command.action({
        garden,
        log,
        args: { names: ["module-b"] },
        opts: withDefaultGlobalOpts({ "watch": false, "force": true, "with-dependants": false }),
      })

      if (errors) {
        throw errors[0]
      }

      const taskOutputResults = taskResultOutputs(result!)
      expect(taskOutputResults["build.module-b"].state).to.equal("ready")

      const keys = getAllProcessedTaskNames(result!.graphResults)

      expect(keys).to.not.include("build.module-c")
      expect(keys).to.not.include("resolve-action.build.module-c")
    })

    it("works with wildcard name", async () => {
      const garden = await makeTestGardenA([], { noCache: true })
      const log = garden.log
      const command = new BuildCommand()

      const { result, errors } = await command.action({
        garden,
        log,
        args: { names: ["*-b"] },
        opts: withDefaultGlobalOpts({ "watch": false, "force": true, "with-dependants": false }),
      })

      if (errors) {
        throw errors[0]
      }

      const taskOutputResults = taskResultOutputs(result!)
      expect(taskOutputResults["build.module-b"].state).to.equal("ready")

      const keys = getAllProcessedTaskNames(result!.graphResults)

      expect(keys).to.not.include("build.module-c")
      expect(keys).to.not.include("resolve-action.build.module-c")
    })
  })

  it("should be protected", async () => {
    const command = new BuildCommand()
    expect(command.protected).to.be.true
  })

  it("should skip disabled modules", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const command = new BuildCommand()

    await garden.scanAndAddConfigs()
    garden["moduleConfigs"]["module-c"].disabled = true

    const { result } = await command.action({
      garden,
      log,
      args: { names: undefined },
      opts: withDefaultGlobalOpts({ "watch": false, "force": true, "with-dependants": false }),
    })

    expect(Object.keys(result!.graphResults).sort()).to.eql(["build.module-a", "build.module-b"])
  })

  it("should build disabled modules if they are dependencies of enabled modules", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const command = new BuildCommand()

    await garden.scanAndAddConfigs()
    // module-b is a build dependency of module-c
    garden["moduleConfigs"]["module-b"].disabled = true

    const { result } = await command.action({
      garden,
      log,
      args: { names: undefined },
      opts: withDefaultGlobalOpts({ "watch": false, "force": true, "with-dependants": false }),
    })

    expect(Object.keys(result!.graphResults).sort()).to.eql(["build.module-a", "build.module-c"])
    expect(result?.graphResults["build.module-c"]?.dependencyResults?.["build.module-c"]?.success).to.be.true
  })

  it("should build dependant modules when using the --with-dependants flag", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const command = new BuildCommand()

    const moduleConfigs: ModuleConfig[] = [
      makeModuleConfig(garden.projectRoot, {
        name: "module-a",
        include: [],
        spec: {
          services: [{ name: "service-a" }],
          tests: [],
          tasks: [],
          build: { command: ["echo", "A"], dependencies: ["module-b", "module-c"] },
        },
      }),
      makeModuleConfig(garden.projectRoot, {
        name: "module-b",
        include: [],
        spec: {
          services: [{ name: "service-b" }],
          tests: [],
          tasks: [],
          build: { command: ["echo", "B"], dependencies: ["module-c"] },
        },
      }),
      makeModuleConfig(garden.projectRoot, {
        name: "module-c",
        include: [],
        spec: {
          services: [{ name: "service-c" }],
          tests: [],
          tasks: [],
          build: { command: ["echo", "C"], dependencies: ["module-d"] },
        },
      }),
      makeModuleConfig(garden.projectRoot, {
        name: "module-d",
        include: [],
        spec: {
          services: [{ name: "service-d" }],
          tests: [],
          tasks: [],
          build: { command: ["echo", "D"], dependencies: [] },
        },
      }),
    ]

    garden.setPartialModuleConfigs(moduleConfigs)

    const { result } = await command.action({
      garden,
      log,
      args: { names: undefined },
      opts: withDefaultGlobalOpts({ "watch": false, "force": true, "with-dependants": true }), // <---
    })

    expect(Object.keys(result!.graphResults).sort()).to.eql([
      "build.module-a",
      "build.module-b",
      "build.module-c",
      "build.module-d",
    ])
  })

  // adds a third level of dependants and tests rebuild logic after changes to modules
  context("tracking changes and rebuilding logic", () => {
    let log: Log
    let buildCommand: BuildCommand
    let projectPath: string
    let defaultOpts: {
      log: Log
    }

    beforeEach(async () => {
      const tmpGarden = await makeTestGardenBuildDependants([], { noCache: true })
      log = tmpGarden.log
      buildCommand = new BuildCommand()
      defaultOpts = { log }
      projectPath = join(tmpGarden.gardenDirPath, "../")
    })

    // The project needs to be deleted for fresh state, otherwise the same one would be reused across the test-cases.
    afterEach(async () => {
      await testProjectTempDirs[projectRootBuildDependants].cleanup()
      delete testProjectTempDirs[projectRootBuildDependants]
    })

    // Can't reuse same garden as there's caching going on that's way too hacky to disable
    async function getFreshTestGarden() {
      return await makeTestGarden(projectPath, { noTempDir: true, noCache: true })
    }

    // dependencies graph: (A and D depend on B which depends on C)
    // A->B->C
    // D->B->C

    it("should optionally build single module and its dependencies", async () => {
      const { result } = await buildCommand.action({
        garden: await makeTestGarden(projectPath, { noTempDir: true }),
        ...defaultOpts,
        args: { names: ["aaa-service"] },
        opts: withDefaultGlobalOpts({ "watch": false, "force": false, "with-dependants": false }),
      })

      expect(Object.keys(taskResultOutputs(result!))).to.eql(["build.aaa-service"])
    })

    it("should rebuild module if a deep dependency has been modified", async () => {
      const { result: result1 } = await buildCommand.action({
        garden: await getFreshTestGarden(),
        ...defaultOpts,
        args: { names: ["aaa-service"] },
        opts: withDefaultGlobalOpts({ "watch": false, "force": true, "with-dependants": false }),
      })

      const allResults1 = getAllTaskResults(result1!.graphResults!)

      await writeFile(join(projectPath, "C/file.txt"), "module c has been modified")

      const { result: result2 } = await buildCommand.action({
        garden: await getFreshTestGarden(),
        ...defaultOpts,
        args: { names: ["aaa-service"] },
        opts: withDefaultGlobalOpts({ "watch": false, "force": false, "with-dependants": false }),
      })

      const allResults2 = getAllTaskResults(result2!.graphResults!)

      expect(allResults2["build.aaa-service"]!.inputVersion).not.to.be.eq(
        allResults1["build.aaa-service"]!.inputVersion
      )
      expect(allResults2["build.bbb-service"]!.inputVersion).not.to.be.eq(
        allResults1["build.bbb-service"]!.inputVersion
      )
      expect(allResults2["build.ccc-service"]!.inputVersion).not.to.be.eq(
        allResults1["build.ccc-service"]!.inputVersion
      )
    })

    it("should rebuild module and dependants if with-dependants flag has been passed", async () => {
      const { result: result1 } = await buildCommand.action({
        garden: await getFreshTestGarden(),
        ...defaultOpts,
        args: { names: undefined }, // all
        opts: withDefaultGlobalOpts({ "watch": false, "force": false, "with-dependants": false }),
      })

      const graphResult1 = result1!.graphResults!
      const allResults1 = getAllTaskResults(graphResult1)

      await writeFile(join(projectPath, "C/file.txt"), "module c has been modified")

      const { result: result2 } = await buildCommand.action({
        garden: await getFreshTestGarden(),
        ...defaultOpts,
        args: { names: ["bbb-service"] },
        opts: withDefaultGlobalOpts({ "watch": false, "force": false, "with-dependants": true }), // <---
      })

      const graphResult2 = result2!.graphResults!
      const allResults2 = getAllTaskResults(graphResult2)

      expect(graphResult2["build.aaa-service"]).to.exist // <-- The dependant should be added to the main output

      expect(allResults2["build.aaa-service"]!.inputVersion).not.to.be.eq(
        allResults1["build.aaa-service"]!.inputVersion
      )
      expect(allResults2["build.bbb-service"]!.inputVersion).not.to.be.eq(
        allResults1["build.bbb-service"]!.inputVersion
      )
      expect(allResults2["build.ccc-service"]!.inputVersion).not.to.be.eq(
        allResults1["build.ccc-service"]!.inputVersion
      )
    })

    it("should rebuild only necessary modules after changes even if with-dependants flag has been passed", async () => {
      const { result: result1 } = await buildCommand.action({
        garden: await getFreshTestGarden(),
        ...defaultOpts,
        args: { names: undefined }, // all
        opts: withDefaultGlobalOpts({ "watch": false, "force": false, "with-dependants": false }),
      })

      const allResults1 = getAllTaskResults(result1!.graphResults!)

      await writeFile(join(projectPath, "B/file.txt"), "module c has been modified")

      const { result: result2 } = await buildCommand.action({
        garden: await getFreshTestGarden(),
        ...defaultOpts,
        args: { names: ["bbb-service"] },
        opts: withDefaultGlobalOpts({ "watch": false, "force": false, "with-dependants": true }), // <---
      })

      const allResults2 = getAllTaskResults(result2!.graphResults!)

      expect(allResults2["build.aaa-service"]!.inputVersion).not.to.be.eq(
        allResults1["build.aaa-service"]!.inputVersion
      )
      expect(allResults2["build.bbb-service"]!.inputVersion).not.to.be.eq(
        allResults1["build.bbb-service"]!.inputVersion
      )
      expect(allResults2["build.ccc-service"]!.inputVersion, "c should be equal as it has not been changed").to.be.eq(
        allResults1["build.ccc-service"]!.inputVersion
      )
    })

    it("should not rebuild dependency after changes", async () => {
      const { result: result1 } = await buildCommand.action({
        garden: await getFreshTestGarden(),
        ...defaultOpts,
        args: { names: undefined }, // all
        opts: withDefaultGlobalOpts({ "watch": false, "force": false, "with-dependants": false }),
      })

      const allResults1 = getAllTaskResults(result1!.graphResults!)

      await writeFile(join(projectPath, "B/file.txt"), "module c has been modified")

      const { result: result2 } = await buildCommand.action({
        garden: await getFreshTestGarden(),
        ...defaultOpts,
        args: { names: ["bbb-service"] },
        opts: withDefaultGlobalOpts({ "watch": false, "force": false, "with-dependants": false }),
      })

      const allResults2 = getAllTaskResults(result2!.graphResults!)

      expect(allResults2["build.bbb-service"]!.inputVersion).not.to.be.eq(
        allResults1["build.bbb-service"]!.inputVersion
      )
      expect(allResults2["build.ccc-service"]!.inputVersion, "c should be equal as it has not been changed").to.be.eq(
        allResults1["build.ccc-service"]!.inputVersion
      )
    })
  })
})
