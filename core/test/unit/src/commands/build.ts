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
import { taskResultOutputs } from "../../../helpers"
import { ModuleConfig } from "../../../../src/config/module"
import { LogEntry } from "../../../../src/logger/log-entry"
import { writeFile } from "fs-extra"
import { join } from "path"
import { ProcessCommandResult } from "../../../../src/commands/base"
import { nodeKey } from "../../../../src/graph/modules"

describe("BuildCommand", () => {
  it("should build all modules in a project and output the results", async () => {
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

    function getBuildModuleResultVersion(result: ProcessCommandResult, moduleName: string) {
      const buildActionResults = result!.graphResults
      const moduleKey = nodeKey("build", moduleName)
      const buildModuleResult = buildActionResults[moduleKey]
      return buildModuleResult?.result?.executedAction?.moduleVersion().versionString
    }

    const buildModuleAVersion = getBuildModuleResultVersion(result!, "module-a")
    const buildModuleBVersion = getBuildModuleResultVersion(result!, "module-b")
    const buildModuleCVersion = getBuildModuleResultVersion(result!, "module-c")

    const graph = await garden.getConfigGraph({ log, emit: false })

    expect(buildModuleAVersion).to.eql(graph.getBuild("module-a").moduleVersion())
    expect(buildModuleBVersion).to.eql(graph.getBuild("module-b").moduleVersion())
    expect(buildModuleCVersion).to.eql(graph.getBuild("module-c").moduleVersion())
  })

  it("should optionally build single module and its dependencies", async () => {
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
      "build.module-b": { state: "ready", outputs: {}, detail: { fresh: true, buildLog: "B" } },
      "build.module-c": { state: "ready", outputs: {}, detail: {} },
    })
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
        "stage-build.ccc-service": {},
        "build.ccc-service": { fresh: true, buildLog: "build ccc module" },
        "stage-build.bbb-service": {},
        "build.bbb-service": { fresh: true, buildLog: "build bbb module" },
        "stage-build.aaa-service": {},
        "build.aaa-service": { fresh: true, buildLog: "build aaa module" },
      })
    })

    it("should rebuild module if a deep dependancy has been modified", async () => {
      const { result: resultFirst } = await buildCommand.action({
        garden: await getFreshTestGarden(),
        ...defaultOpts,
        args: { names: ["aaa-service"] },
        opts: withDefaultGlobalOpts({ "watch": false, "force": false, "with-dependants": false }),
      })
      const graphResultFirst = resultFirst?.graphResults

      await writeFile(join(projectPath, "C/file.txt"), "module c has been modified")

      const { result: resultSecond } = await buildCommand.action({
        garden: await getFreshTestGarden(),
        ...defaultOpts,
        args: { names: ["aaa-service"] },
        opts: withDefaultGlobalOpts({ "watch": false, "force": false, "with-dependants": false }),
      })
      const graphResultSecond = resultSecond?.graphResults

      // expect(Object.keys(resultSecond?.builds!).length).to.be.eq(3)
      expect(graphResultSecond?.["build.ccc-service"]?.version).not.to.be.eq(
        graphResultFirst?.["build.ccc-service"]?.version
      )
      expect(graphResultSecond?.["build.bbb-service"]?.version).not.to.be.eq(
        graphResultFirst?.["build.bbb-service"]?.version
      )
      expect(graphResultSecond?.["build.aaa-service"]?.version).not.to.be.eq(
        graphResultFirst?.["build.aaa-service"]?.version
      )
    })

    it("should rebuild module and dependants if with-dependants flag has been passed", async () => {
      const { result: resultFirst } = await buildCommand.action({
        garden: await getFreshTestGarden(),
        ...defaultOpts,
        args: { names: undefined }, // all
        opts: withDefaultGlobalOpts({ "watch": false, "force": false, "with-dependants": false }),
      })
      const graphResultFirst = resultFirst?.graphResults

      await writeFile(join(projectPath, "C/file.txt"), "module c has been modified")

      const { result: resultSecond } = await buildCommand.action({
        garden: await getFreshTestGarden(),
        ...defaultOpts,
        args: { names: ["bbb-service"] },
        opts: withDefaultGlobalOpts({ "watch": false, "force": false, "with-dependants": true }), // <---
      })
      const graphResultSecond = resultSecond?.graphResults

      // expect(Object.keys(resultSecond?.builds!).length).to.be.eq(4)
      expect(graphResultSecond?.["build.aaa-service"]?.version).not.to.be.eq(
        graphResultFirst?.["build.aaa-service"]?.version
      )
      expect(graphResultSecond?.["build.bbb-service"]?.version).not.to.be.eq(
        graphResultFirst?.["build.bbb-service"]?.version
      )
      expect(graphResultSecond?.["build.ccc-service"]?.version).not.to.be.eq(
        graphResultFirst?.["build.ccc-service"]?.version
      )
      expect(graphResultSecond?.["build.ddd-service"]?.version).not.to.be.eq(
        graphResultFirst?.["build.ddd-service"]?.version
      )
    })

    it("should rebuild only necessary modules after changes even if with-dependants flag has been passed", async () => {
      const { result: resultFirst } = await buildCommand.action({
        garden: await getFreshTestGarden(),
        ...defaultOpts,
        args: { names: undefined }, // all
        opts: withDefaultGlobalOpts({ "watch": false, "force": false, "with-dependants": false }),
      })
      const graphResultFirst = resultFirst?.graphResults

      await writeFile(join(projectPath, "B/file.txt"), "module b has been modified")

      const { result: resultSecond } = await buildCommand.action({
        garden: await getFreshTestGarden(),
        ...defaultOpts,
        args: { names: ["bbb-service"] },
        opts: withDefaultGlobalOpts({ "watch": false, "force": false, "with-dependants": true }), // <---
      })
      const graphResultSecond = resultSecond?.graphResults

      // expect(Object.keys(resultSecond?.builds!).length).to.be.eq(4)
      expect(graphResultSecond?.["build.aaa-service"]?.version).not.to.be.eq(
        graphResultFirst?.["build.aaa-service"]?.version
      )
      expect(graphResultSecond?.["build.bbb-service"]?.version).not.to.be.eq(
        graphResultFirst?.["build.bbb-service"]?.version
      )
      expect(graphResultSecond?.["build.ddd-service"]?.version).not.to.be.eq(
        graphResultFirst?.["build.ddd-service"]?.version
      )
      expect(
        graphResultSecond?.["build.ccc-service"]?.version,
        "c should be equal as it has not been changed"
      ).to.be.eq(resultFirst?.["build.ccc-service"].version)
    })

    it("should not rebuild dependency after changes", async () => {
      const { result: resultFirst } = await buildCommand.action({
        garden: await getFreshTestGarden(),
        ...defaultOpts,
        args: { names: undefined }, // all
        opts: withDefaultGlobalOpts({ "watch": false, "force": false, "with-dependants": false }),
      })
      const graphResultFirst = resultFirst?.graphResults

      await writeFile(join(projectPath, "B/file.txt"), "module b has been modified")

      const { result: resultSecond } = await buildCommand.action({
        garden: await getFreshTestGarden(),
        ...defaultOpts,
        args: { names: ["bbb-service"] },
        opts: withDefaultGlobalOpts({ "watch": false, "force": false, "with-dependants": false }),
      })
      const graphResultSecond = resultSecond?.graphResults

      // expect(Object.keys(resultSecond?.builds!).length).to.be.eq(2)
      expect(graphResultSecond?.["build.bbb-service"]?.version, "b should change as it was updated").not.to.be.eq(
        graphResultFirst?.["build.bbb-service"]?.version
      )
      expect(graphResultSecond?.["build.ccc-service"]?.version, "c should not change as it was not updated").to.be.eq(
        graphResultFirst?.["build.ccc-service"]?.version
      )
    })
  })
})
