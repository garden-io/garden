/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BuildCommand } from "../../../../src/commands/build"
import { expect } from "chai"
import { makeModuleConfig, makeTestGardenA, withDefaultGlobalOpts } from "../../../helpers"
import { taskResultOutputs } from "../../../helpers"
import { keyBy } from "lodash"
import { ModuleConfig } from "../../../../src/config/module"

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
      args: { modules: undefined },
      opts: withDefaultGlobalOpts({ "watch": false, "force": true, "with-dependants": false }),
    })

    expect(command.outputsSchema().validate(result).error).to.be.undefined

    const { builds } = result!

    expect(taskResultOutputs(result!)).to.eql({
      "build.module-a": { fresh: true, buildLog: "A" },
      "build.module-b": { fresh: true, buildLog: "B" },
      "build.module-c": {},
      "stage-build.module-a": {},
      "stage-build.module-b": {},
      "stage-build.module-c": {},
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
      args: { modules: ["module-b"] },
      opts: withDefaultGlobalOpts({ "watch": false, "force": true, "with-dependants": false }),
    })

    expect(taskResultOutputs(result!)).to.eql({
      "build.module-a": { fresh: true, buildLog: "A" },
      "build.module-b": { fresh: true, buildLog: "B" },
      "stage-build.module-a": {},
      "stage-build.module-b": {},
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
      args: { modules: undefined },
      opts: withDefaultGlobalOpts({ "watch": false, "force": true, "with-dependants": false }),
    })

    expect(taskResultOutputs(result!)).to.eql({
      "build.module-a": { fresh: true, buildLog: "A" },
      "build.module-b": { fresh: true, buildLog: "B" },
      "stage-build.module-a": {},
      "stage-build.module-b": {},
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
      args: { modules: undefined },
      opts: withDefaultGlobalOpts({ "watch": false, "force": true, "with-dependants": false }),
    })

    expect(taskResultOutputs(result!)).to.eql({
      "build.module-a": { fresh: true, buildLog: "A" },
      "build.module-b": { fresh: true, buildLog: "B" },
      "build.module-c": {},
      "stage-build.module-a": {},
      "stage-build.module-b": {},
      "stage-build.module-c": {},
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
      args: { modules: undefined },
      opts: withDefaultGlobalOpts({ "watch": false, "force": true, "with-dependants": true }), // <---
    })

    expect(taskResultOutputs(result!)).to.eql({
      "build.module-a": { fresh: true, buildLog: "A" },
      "build.module-b": { fresh: true, buildLog: "B" },
      "build.module-c": { fresh: true, buildLog: "C" },
      "build.module-d": { fresh: true, buildLog: "D" },
      "stage-build.module-a": {},
      "stage-build.module-b": {},
      "stage-build.module-c": {},
      "stage-build.module-d": {},
    })
  })
})
