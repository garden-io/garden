/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BuildCommand } from "../../../../src/commands/build"
import { expect } from "chai"
import {
  makeModuleConfig,
  makeTestGarden,
  makeTestGardenA,
  makeTestGardenBuildDependants,
  projectRootBuildDependants,
  testProjectTempDirs,
  withDefaultGlobalOpts,
} from "../../../helpers"
import { taskResultOutputs, getAllTaskResults } from "../../../helpers"
import { ModuleConfig } from "../../../../src/config/module"
import { LogEntry } from "../../../../src/logger/log-entry"
import { writeFile } from "fs-extra"
import { join } from "path"
import { ProcessCommandResult } from "../../../../src/commands/base"
import { nodeKey } from "../../../../src/graph/modules"

describe("BuildCommand", () => {
  it("should build everything in a project and output the results", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const footerLog = garden.log
    const command = new BuildCommand()

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog,
      args: { names: undefined },
      opts: withDefaultGlobalOpts({ "watch": false, "force": true, "with-dependants": false }),
    })

    expect(command.outputsSchema().validate(result).error).to.be.undefined

    // TODO-G2B: think about a way to use type-safe values in taskOutputResults
    const taskOutputResults = taskResultOutputs(result!)
    expect(taskOutputResults).to.eql({
      "build.module-a": {
        state: "ready",
        outputs: {},
        detail: { fresh: true, buildLog: "A" },
      },
      "build.module-b": {
        state: "ready",
        outputs: {},
        detail: { fresh: true, buildLog: "B" },
      },
      "build.module-c": {
        state: "ready",
        outputs: {},
        detail: {},
      },
    })

    // eslint-disable-next-line no-shadow,@typescript-eslint/no-shadow
    function getBuildModuleResultVersion(result: ProcessCommandResult, moduleName: string): string {
      const buildActionResults = result!.graphResults
      const moduleKey = nodeKey("build", moduleName)
      const buildModuleResult = buildActionResults[moduleKey]
      return buildModuleResult?.result?.executedAction?.moduleVersion().versionString
    }

    const buildModuleAVersion = getBuildModuleResultVersion(result!, "module-a")
    const buildModuleBVersion = getBuildModuleResultVersion(result!, "module-b")
    const buildModuleCVersion = getBuildModuleResultVersion(result!, "module-c")

    const graph = await garden.getConfigGraph({ log, emit: false })

    expect(buildModuleAVersion).to.eql(graph.getBuild("module-a").moduleVersion().versionString)
    expect(buildModuleBVersion).to.eql(graph.getBuild("module-b").moduleVersion().versionString)
    expect(buildModuleCVersion).to.eql(graph.getBuild("module-c").moduleVersion().versionString)
  })

  it("should optionally run single build and its dependencies", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const footerLog = garden.log
    const command = new BuildCommand()

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog,
      args: { names: ["module-b"] },
      opts: withDefaultGlobalOpts({ "watch": false, "force": true, "with-dependants": false }),
    })

    const taskOutputResults = taskResultOutputs(result!)
    expect(taskOutputResults).to.eql({
      "build.module-b": {
        state: "ready",
        outputs: {},
        detail: { fresh: true, buildLog: "B" },
      },
    })
  })

  it("should be protected", async () => {
    const command = new BuildCommand()
    expect(command.protected).to.be.true
  })

  it("should skip disabled modules", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const footerLog = garden.log
    const command = new BuildCommand()

    await garden.scanAndAddConfigs()
    garden["moduleConfigs"]["module-c"].disabled = true

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog,
      args: { names: undefined },
      opts: withDefaultGlobalOpts({ "watch": false, "force": true, "with-dependants": false }),
    })

    expect(taskResultOutputs(result!)).to.eql({
      "build.module-a": { state: "ready", outputs: {}, detail: { fresh: true, buildLog: "A" } },
      "build.module-b": { state: "ready", outputs: {}, detail: { fresh: true, buildLog: "B" } },
    })
  })

  it("should build disabled modules if they are dependencies of enabled modules", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const footerLog = garden.log
    const command = new BuildCommand()

    await garden.scanAndAddConfigs()
    // module-b is a build dependency of module-c
    garden["moduleConfigs"]["module-b"].disabled = true

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog,
      args: { names: undefined },
      opts: withDefaultGlobalOpts({ "watch": false, "force": true, "with-dependants": false }),
    })

    expect(taskResultOutputs(result!)).to.eql({
      "build.module-a": { state: "ready", outputs: {}, detail: { fresh: true, buildLog: "A" } },
      "build.module-c": { state: "ready", outputs: {}, detail: {} },
    })

    expect(result?.graphResults["build.module-c"]?.dependencyResults?.["build.module-c"]?.success).to.be.true
  })

  it("should build dependant modules when using the --with-dependants flag", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const footerLog = garden.log
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

    garden.setActionConfigs(moduleConfigs)

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog,
      args: { names: undefined },
      opts: withDefaultGlobalOpts({ "watch": false, "force": true, "with-dependants": true }), // <---
    })

    expect(taskResultOutputs(result!)).to.eql({
      "build.module-a": { state: "ready", outputs: {}, detail: { fresh: true, buildLog: "A" } },
      "build.module-b": { state: "ready", outputs: {}, detail: { fresh: true, buildLog: "B" } },
      "build.module-c": { state: "ready", outputs: {}, detail: { fresh: true, buildLog: "C" } },
      "build.module-d": { state: "ready", outputs: {}, detail: { fresh: true, buildLog: "D" } },
    })
  })

  // adds a third level of dependants and tests rebuild logic after changes to modules
  context("tracking changes and rebuilding logic", () => {
    let log: LogEntry
    let buildCommand: BuildCommand
    let projectPath: string
    let defaultOpts: {
      log: LogEntry
      headerLog: LogEntry
      footerLog: LogEntry
    }

    beforeEach(async () => {
      const tmpGarden = await makeTestGardenBuildDependants([], { noCache: true })
      log = tmpGarden.log
      buildCommand = new BuildCommand()
      defaultOpts = { log, headerLog: log, footerLog: log }
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

      expect(taskResultOutputs(result!)).to.eql({
        "build.aaa-service": { state: "ready", outputs: {}, detail: { fresh: true, buildLog: "build aaa module" } },
      })
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

      expect(allResults2["build.aaa-service"]!.version).not.to.be.eq(allResults1["build.aaa-service"]!.version)
      expect(allResults2["build.bbb-service"]!.version).not.to.be.eq(allResults1["build.bbb-service"]!.version)
      expect(allResults2["build.ccc-service"]!.version).not.to.be.eq(allResults1["build.ccc-service"]!.version)
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

      expect(allResults2["build.aaa-service"]!.version).not.to.be.eq(allResults1["build.aaa-service"]!.version)
      expect(allResults2["build.bbb-service"]!.version).not.to.be.eq(allResults1["build.bbb-service"]!.version)
      expect(allResults2["build.ccc-service"]!.version).not.to.be.eq(allResults1["build.ccc-service"]!.version)
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

      expect(allResults2["build.aaa-service"]!.version).not.to.be.eq(allResults1["build.aaa-service"]!.version)
      expect(allResults2["build.bbb-service"]!.version).not.to.be.eq(allResults1["build.bbb-service"]!.version)
      expect(allResults2["build.ccc-service"]!.version, "c should be equal as it has not been changed").to.be.eq(
        allResults1["build.ccc-service"]!.version
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

      expect(allResults2["build.bbb-service"]!.version).not.to.be.eq(allResults1["build.bbb-service"]!.version)
      expect(allResults2["build.ccc-service"]!.version, "c should be equal as it has not been changed").to.be.eq(
        allResults1["build.ccc-service"]!.version
      )
    })
  })
})
