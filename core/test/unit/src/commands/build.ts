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
import { keyBy } from "lodash"
import { ModuleConfig } from "../../../../src/config/module"
import { LogEntry } from "../../../../src/logger/log-entry"
import { writeFile } from "fs-extra"
import { join } from "path"

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

    const { builds } = result!

    expect(taskResultOutputs(result!)).to.eql({
      "build.module-a": { fresh: true, buildLog: "A" },
      "build.module-b": { fresh: true, buildLog: "B" },
      "build.module-c": {},
    })

    for (const build of Object.values(builds)) {
      expect(build.durationMsec).to.gte(0)
      build.durationMsec = 0
    }

    const graph = await garden.getConfigGraph({ log, emit: false })
    const modules = keyBy(graph.getModules(), "name")

    expect(builds).to.eql({
      "module-a": {
        fresh: true,
        buildLog: "A",
        aborted: false,
        durationMsec: 0,
        error: undefined,
        success: true,
        version: modules["module-a"].version.versionString,
      },
      "module-b": {
        fresh: true,
        buildLog: "B",
        aborted: false,
        durationMsec: 0,
        error: undefined,
        success: true,
        version: modules["module-b"].version.versionString,
      },
      "module-c": {
        aborted: false,
        durationMsec: 0,
        error: undefined,
        success: true,
        version: modules["module-c"].version.versionString,
      },
    })
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

    expect(taskResultOutputs(result!)).to.eql({
      "build.module-a": { fresh: true, buildLog: "A" },
      "build.module-b": { fresh: true, buildLog: "B" },
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
      "build.module-a": { fresh: true, buildLog: "A" },
      "build.module-b": { fresh: true, buildLog: "B" },
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
      "build.module-a": { fresh: true, buildLog: "A" },
      "build.module-b": { fresh: true, buildLog: "B" },
      "build.module-c": {},
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

    garden.setModuleConfigs(moduleConfigs)

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog,
      args: { names: undefined },
      opts: withDefaultGlobalOpts({ "watch": false, "force": true, "with-dependants": true }), // <---
    })

    expect(taskResultOutputs(result!)).to.eql({
      "build.module-a": { fresh: true, buildLog: "A" },
      "build.module-b": { fresh: true, buildLog: "B" },
      "build.module-c": { fresh: true, buildLog: "C" },
      "build.module-d": { fresh: true, buildLog: "D" },
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

    // dependencie graph: (A and D depend on B which depends on C)
    // A->B->C
    // D->B->C

    it("should optionally build single module and its dependencies", async () => {
      const { result } = await buildCommand.action({
        garden: await makeTestGarden(projectPath, { noTempDir: true }),
        ...defaultOpts,
        args: { modules: ["aaa-service"] },
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
        args: { modules: ["aaa-service"] },
        opts: withDefaultGlobalOpts({ "watch": false, "force": false, "with-dependants": false }),
      })

      await writeFile(join(projectPath, "C/file.txt"), "module c has been modified")

      const { result: resultSecond } = await buildCommand.action({
        garden: await getFreshTestGarden(),
        ...defaultOpts,
        args: { modules: ["aaa-service"] },
        opts: withDefaultGlobalOpts({ "watch": false, "force": false, "with-dependants": false }),
      })

      expect(Object.keys(resultSecond?.builds!).length).to.be.eq(3)
      expect(resultSecond?.builds["ccc-service"].version).not.to.be.eq(resultFirst?.builds["ccc-service"].version)
      expect(resultSecond?.builds["bbb-service"].version).not.to.be.eq(resultFirst?.builds["bbb-service"].version)
      expect(resultSecond?.builds["aaa-service"].version).not.to.be.eq(resultFirst?.builds["aaa-service"].version)
    })

    it("should rebuild module and dependants if with-dependants flag has been passed", async () => {
      const { result: resultFirst } = await buildCommand.action({
        garden: await getFreshTestGarden(),
        ...defaultOpts,
        args: { modules: undefined }, // all
        opts: withDefaultGlobalOpts({ "watch": false, "force": false, "with-dependants": false }),
      })

      await writeFile(join(projectPath, "C/file.txt"), "module c has been modified")

      const { result: resultSecond } = await buildCommand.action({
        garden: await getFreshTestGarden(),
        ...defaultOpts,
        args: { modules: ["bbb-service"] },
        opts: withDefaultGlobalOpts({ "watch": false, "force": false, "with-dependants": true }), // <---
      })

      expect(Object.keys(resultSecond?.builds!).length).to.be.eq(4)
      expect(resultSecond?.builds["aaa-service"].version).not.to.be.eq(resultFirst?.builds["aaa-service"].version)
      expect(resultSecond?.builds["bbb-service"].version).not.to.be.eq(resultFirst?.builds["bbb-service"].version)
      expect(resultSecond?.builds["ccc-service"].version).not.to.be.eq(resultFirst?.builds["ccc-service"].version)
      expect(resultSecond?.builds["ddd-service"].version).not.to.be.eq(resultFirst?.builds["ddd-service"].version)
    })

    it("should rebuild only necessary modules after changes even if with-dependants flag has been passed", async () => {
      const { result: resultFirst } = await buildCommand.action({
        garden: await getFreshTestGarden(),
        ...defaultOpts,
        args: { modules: undefined }, // all
        opts: withDefaultGlobalOpts({ "watch": false, "force": false, "with-dependants": false }),
      })

      await writeFile(join(projectPath, "B/file.txt"), "module b has been modified")

      const { result: resultSecond } = await buildCommand.action({
        garden: await getFreshTestGarden(),
        ...defaultOpts,
        args: { modules: ["bbb-service"] },
        opts: withDefaultGlobalOpts({ "watch": false, "force": false, "with-dependants": true }), // <---
      })

      expect(Object.keys(resultSecond?.builds!).length).to.be.eq(4)
      expect(resultSecond?.builds["aaa-service"].version).not.to.be.eq(resultFirst?.builds["aaa-service"].version)
      expect(resultSecond?.builds["bbb-service"].version).not.to.be.eq(resultFirst?.builds["bbb-service"].version)
      expect(resultSecond?.builds["ddd-service"].version).not.to.be.eq(resultFirst?.builds["ddd-service"].version)
      expect(resultSecond?.builds["ccc-service"].version, "c should be equal as it has not been changed").to.be.eq(
        resultFirst?.builds["ccc-service"].version
      )
    })

    it("should not rebuild dependency after changes", async () => {
      const { result: resultFirst } = await buildCommand.action({
        garden: await getFreshTestGarden(),
        ...defaultOpts,
        args: { modules: undefined }, // all
        opts: withDefaultGlobalOpts({ "watch": false, "force": false, "with-dependants": false }),
      })

      await writeFile(join(projectPath, "B/file.txt"), "module b has been modified")

      const { result: resultSecond } = await buildCommand.action({
        garden: await getFreshTestGarden(),
        ...defaultOpts,
        args: { modules: ["bbb-service"] },
        opts: withDefaultGlobalOpts({ "watch": false, "force": false, "with-dependants": false }),
      })

      expect(Object.keys(resultSecond?.builds!).length).to.be.eq(2)
      expect(resultSecond?.builds["bbb-service"].version, "b should change as it was updated").not.to.be.eq(
        resultFirst?.builds["bbb-service"].version
      )
      expect(resultSecond?.builds["ccc-service"].version, "c should not change as it was not updated").to.be.eq(
        resultFirst?.builds["ccc-service"].version
      )
    })
  })
})
