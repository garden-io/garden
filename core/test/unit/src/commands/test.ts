/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { TestCommand } from "../../../../src/commands/test"
import isSubset = require("is-subset")
import { makeModuleConfig, makeTestGardenA, taskResultOutputs, withDefaultGlobalOpts } from "../../../helpers"
import { ModuleConfig } from "../../../../src/config/module"

describe("TestCommand", () => {
  const command = new TestCommand()

  it("should run all tests in a simple project", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const graph = await garden.getConfigGraph({ log, emit: false })

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { names: undefined },
      opts: withDefaultGlobalOpts({
        "name": undefined,
        "force": true,
        "force-build": true,
        "watch": false,
        "skip": [],
        "skip-dependencies": false,
        "skip-dependants": false,
        "interactive": false,
        "module": undefined,
      }),
    })

    expect(command.outputsSchema().validate(result).error).to.be.undefined

    const outputs = taskResultOutputs(result!)

    expect(
      isSubset(outputs, {
        "build.module-a": {
          fresh: true,
          buildLog: "A",
        },
        "test.module-a.unit": {
          success: true,
          log: "OK",
        },
        "build.module-b": {
          fresh: true,
          buildLog: "B",
        },
        "build.module-c": {},
        "test.module-b.unit": {
          success: true,
          log: "OK",
        },
        "test.module-c.unit": {
          success: true,
          log: "OK",
        },
      }),
      `Got: ${JSON.stringify(outputs)}`
    ).to.be.true

    const testActionResult = result!.graphResults

    const dummyDate = new Date()

    for (const res of Object.values(testActionResult)) {
      // expect(res.durationMsec).to.gte(0)
      // res.durationMsec = 0

      expect(res?.startedAt).to.be.a("Date")
      if (!!res) {
        res.startedAt = dummyDate
      }

      expect(res?.completedAt).to.be.a("Date")
      if (!!res) {
        res.completedAt = dummyDate
      }
    }

    expect(testActionResult).to.eql({
      "test.module-a.unit": {
        moduleName: "module-a",
        command: ["echo", "OK"],
        testName: "unit",
        version: graph.getTest("module-a.unit").versionString(),
        success: true,
        startedAt: dummyDate,
        completedAt: dummyDate,
        log: "OK",
        aborted: false,
        durationMsec: 0,
        error: undefined,
      },
      "test.module-a.integration": {
        moduleName: "module-a",
        command: ["echo", "OK"],
        testName: "integration",
        version: graph.getTest("module-a.integration").versionString(),
        success: true,
        startedAt: dummyDate,
        completedAt: dummyDate,
        log: "OK",
        aborted: false,
        durationMsec: 0,
        error: undefined,
      },
      "test.module-b.unit": {
        moduleName: "module-b",
        command: ["echo", "OK"],
        testName: "unit",
        version: graph.getTest("module-b.unit").versionString(),
        success: true,
        startedAt: dummyDate,
        completedAt: dummyDate,
        log: "OK",
        aborted: false,
        durationMsec: 0,
        error: undefined,
      },
      "test.module-c.unit": {
        moduleName: "module-c",
        command: ["echo", "OK"],
        testName: "unit",
        version: graph.getTest("module-c.unit").versionString(),
        success: true,
        startedAt: dummyDate,
        completedAt: dummyDate,
        log: "OK",
        aborted: false,
        durationMsec: 0,
        error: undefined,
      },
      "test.module-c.integ": {
        moduleName: "module-c",
        command: ["echo", "OK"],
        testName: "integ",
        version: graph.getTest("module-c.integ").versionString(),
        success: true,
        startedAt: dummyDate,
        completedAt: dummyDate,
        log: "OK",
        aborted: false,
        durationMsec: 0,
        error: undefined,
      },
    })
  })

  it("should optionally test single module", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { names: ["module-a"] },
      opts: withDefaultGlobalOpts({
        "name": undefined,
        "force": true,
        "force-build": true,
        "watch": false,
        "skip": [],
        "skip-dependencies": false,
        "skip-dependants": false,
        "interactive": false,
        "module": undefined,
      }),
    })

    expect(
      isSubset(taskResultOutputs(result!), {
        "build.module-a": {
          fresh: true,
          buildLog: "A",
        },
        "test.module-a.unit": {
          success: true,
          log: "OK",
        },
      })
    ).to.be.true
  })

  it("should optionally skip tests by name", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { names: ["module-a"] },
      opts: withDefaultGlobalOpts({
        "name": undefined,
        "force": true,
        "force-build": true,
        "watch": false,
        "skip": ["int*"],
        "skip-dependencies": false,
        "skip-dependants": false,
        "interactive": false,
        "module": undefined,
      }),
    })

    expect(
      isSubset(taskResultOutputs(result!), {
        "build.module-a": {
          fresh: true,
          buildLog: "A",
        },
        "test.module-a.integration": {
          success: true,
          log: "OK",
        },
        "test.module-c.integ": {
          success: true,
          log: "OK",
        },
      })
    ).to.be.false

    expect(
      isSubset(taskResultOutputs(result!), {
        "test.module-a.unit": {
          success: true,
          log: "OK",
        },
        "test.module-c.unit": {
          success: true,
          log: "OK",
        },
      })
    ).to.be.true
  })

  it("handles --interactive option if single test name is specified", async () => {
    throw "TODO"
  })

  it("throws if --interactive option is set and no test name is specified in arguments", async () => {
    throw "TODO"
  })

  it("throws if --interactive option is set and multiple test names are specified in arguments", async () => {
    throw "TODO"
  })

  it("throws if --interactive option is set along with --watch", async () => {
    throw "TODO"
  })

  it("should only run integration tests if the option 'name' is specified with a glob", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { names: ["module-a"] },
      opts: withDefaultGlobalOpts({
        "name": ["int*"],
        "force": true,
        "force-build": true,
        "skip": [],
        "watch": false,
        "skip-dependencies": false,
        "skip-dependants": false,
        "interactive": false,
        "module": undefined,
      }),
    })

    expect(
      isSubset(taskResultOutputs(result!), {
        "build.module-a": {
          fresh: true,
          buildLog: "A",
        },
        "test.module-a.integration": {
          success: true,
          log: "OK",
        },
        "test.module-c.integ": {
          success: true,
          log: "OK",
        },
      })
    ).to.be.true

    expect(
      isSubset(taskResultOutputs(result!), {
        "test.module-a.unit": {
          success: true,
          log: "OK",
        },
        "test.module-c.unit": {
          success: true,
          log: "OK",
        },
      })
    ).to.be.false
  })

  it("should be protected", async () => {
    expect(command.protected).to.be.true
  })

  it("should skip disabled tests", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log

    await garden.scanAndAddConfigs()
    garden["moduleConfigs"]["module-c"].spec.tests[0].disabled = true

    const { result, errors } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { names: ["module-c"] },
      opts: withDefaultGlobalOpts({
        "name": undefined,
        "force": true,
        "force-build": false,
        "watch": false,
        "skip": [],
        "skip-dependencies": false,
        "skip-dependants": false,
        "interactive": false,
        "module": undefined,
      }),
    })

    if (errors) {
      throw errors[0]
    }

    expect(Object.keys(taskResultOutputs(result!)).sort()).to.eql([
      "build.module-a",
      "build.module-b",
      "build.module-c",

      "test.module-c.integ",
    ])
  })

  it("should skip tests from disabled modules", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log

    await garden.scanAndAddConfigs()
    garden["moduleConfigs"]["module-c"].disabled = true

    const { result, errors } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { names: undefined },
      opts: withDefaultGlobalOpts({
        "name": undefined,
        "force": true,
        "force-build": false,
        "watch": false,
        "skip": [],
        "skip-dependencies": false,
        "skip-dependants": false,
        "interactive": false,
        "module": undefined,
      }),
    })

    if (errors) {
      throw errors[0]
    }

    expect(Object.keys(taskResultOutputs(result!)).sort()).to.eql([
      "build.module-a",
      "build.module-b",
      "deploy.service-a",
      "get-service-status.service-a",
      "test.module-a.integration",
      "test.module-a.unit",
      "test.module-b.unit",
    ])
  })

  it("selects a test by name from positional argument", async () => {
    throw "TODO"
  })

  it("selects tests by glob from positional argument", async () => {
    throw "TODO"
  })

  it("concatenates positional args and --name flags", async () => {
    throw "TODO"
  })

  it("applies --module filter", async () => {
    throw "TODO"
  })

  it("applies --module filter combined with name argument", async () => {
    throw "TODO"
  })

  it("throws if --module filter specifies module that does not exist", async () => {
    throw "TODO"
  })

  context("when --skip-dependencies is passed", () => {
    it("should not process runtime dependencies", async () => {
      const garden = await makeTestGardenA()
      const log = garden.log

      const moduleConfigs: ModuleConfig[] = [
        makeModuleConfig(garden.projectRoot, {
          name: "module-a",
          include: [],
          spec: {
            services: [{ name: "service-a" }],
            tests: [
              { name: "unit", command: ["echo", "OK"] },
              { name: "integration", command: ["echo", "OK"], dependencies: ["service-a"] },
            ],
            tasks: [],
            build: { command: ["echo", "A"], dependencies: [] },
          },
        }),
        makeModuleConfig(garden.projectRoot, {
          name: "module-b",
          include: [],
          spec: {
            services: [{ name: "service-b", dependencies: ["task-b"] }],
            tests: [
              { name: "unit", command: ["echo", "OK"] },
              { name: "integration", command: ["echo", "OK"], dependencies: ["service-b"] },
            ],
            tasks: [{ command: ["echo", "A"], name: "task-b" }],
            build: { command: ["echo", "A"], dependencies: [] },
          },
        }),
      ]

      garden.setActionConfigs(moduleConfigs)

      const { result, errors } = await command.action({
        garden,
        log,
        headerLog: log,
        footerLog: log,
        args: { names: ["module-a"] },
        opts: withDefaultGlobalOpts({
          "name": undefined,
          "force": true,
          "force-build": false,
          "watch": false,
          "skip": [],
          "skip-dependencies": true, // <----
          "skip-dependants": false,
          "interactive": false,
          "module": undefined,
        }),
      })

      if (errors) {
        throw errors[0]
      }

      expect(Object.keys(taskResultOutputs(result!)).sort()).to.eql([
        "build.module-a",
        // "deploy.service-a", // skipped
        // "deploy.service-b", // skipped
        "get-service-status.service-a",

        "test.module-a.integration",
        "test.module-a.unit",
      ])
    })
  })
})
