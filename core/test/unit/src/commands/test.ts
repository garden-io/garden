/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { TestCommand } from "../../../../src/commands/test"
import isSubset = require("is-subset")
import { makeTestGardenA, taskResultOutputs, withDefaultGlobalOpts } from "../../../helpers"
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
      args: { modules: undefined },
      opts: withDefaultGlobalOpts({
        "name": undefined,
        "force": true,
        "force-build": true,
        "watch": false,
        "skip-dependants": false,
      }),
    })

    expect(command.outputsSchema().validate(result).error).to.be.undefined

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
      })
    ).to.be.true

    const { tests } = result!

    const dummyDate = new Date()

    for (const res of Object.values(tests)) {
      expect(res.durationMsec).to.gte(0)
      res.durationMsec = 0

      expect(res.startedAt).to.be.a("Date")
      res.startedAt = dummyDate

      expect(res.completedAt).to.be.a("Date")
      res.completedAt = dummyDate
    }

    expect(tests).to.eql({
      "module-a.unit": {
        moduleName: "module-a",
        command: ["echo", "OK"],
        testName: "unit",
        version: graph.getTest("module-a", "unit").version,
        success: true,
        startedAt: dummyDate,
        completedAt: dummyDate,
        log: "OK",
        aborted: false,
        durationMsec: 0,
        error: undefined,
      },
      "module-a.integration": {
        moduleName: "module-a",
        command: ["echo", "OK"],
        testName: "integration",
        version: graph.getTest("module-a", "integration").version,
        success: true,
        startedAt: dummyDate,
        completedAt: dummyDate,
        log: "OK",
        aborted: false,
        durationMsec: 0,
        error: undefined,
      },
      "module-b.unit": {
        moduleName: "module-b",
        command: ["echo", "OK"],
        testName: "unit",
        version: graph.getTest("module-b", "unit").version,
        success: true,
        startedAt: dummyDate,
        completedAt: dummyDate,
        log: "OK",
        aborted: false,
        durationMsec: 0,
        error: undefined,
      },
      "module-c.unit": {
        moduleName: "module-c",
        command: ["echo", "OK"],
        testName: "unit",
        version: graph.getTest("module-c", "unit").version,
        success: true,
        startedAt: dummyDate,
        completedAt: dummyDate,
        log: "OK",
        aborted: false,
        durationMsec: 0,
        error: undefined,
      },
      "module-c.integ": {
        moduleName: "module-c",
        command: ["echo", "OK"],
        testName: "integ",
        version: graph.getTest("module-c", "integ").version,
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
      args: { modules: ["module-a"] },
      opts: withDefaultGlobalOpts({
        "name": undefined,
        "force": true,
        "force-build": true,
        "watch": false,
        "skip-dependants": false,
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

  it("should only run integration tests if the option 'name' is specified with a glob", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { modules: ["module-a"] },
      opts: withDefaultGlobalOpts({
        "name": ["int*"],
        "force": true,
        "force-build": true,
        "watch": false,
        "skip-dependants": false,
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
      args: { modules: ["module-c"] },
      opts: withDefaultGlobalOpts({
        "name": undefined,
        "force": true,
        "force-build": false,
        "watch": false,
        "skip-dependants": false,
      }),
    })

    if (errors) {
      throw errors[0]
    }

    expect(Object.keys(taskResultOutputs(result!)).sort()).to.eql([
      "build.module-a",
      "build.module-b",
      "build.module-c",
      "stage-build.module-a",
      "stage-build.module-b",
      "stage-build.module-c",
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
      args: { modules: undefined },
      opts: withDefaultGlobalOpts({
        "name": undefined,
        "force": true,
        "force-build": false,
        "watch": false,
        "skip-dependants": false,
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
      "stage-build.module-a",
      "stage-build.module-b",
      "test.module-a.integration",
      "test.module-a.unit",
      "test.module-b.unit",
    ])
  })

  it("should skip dependant modules if --skip-dependants is passed", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log

    const moduleConfigs: ModuleConfig[] = [
      {
        apiVersion: "garden.io/v0",
        kind: "Module",
        name: "module-a",
        include: [],
        build: { dependencies: [] },
        path: garden.projectRoot,
        serviceConfigs: [],
        disabled: false,
        allowPublish: false,
        spec: {
          services: [{ name: "service-a" }],
          tests: [
            { name: "unit", command: ["echo", "OK"] },
            { name: "integration", command: ["echo", "OK"], dependencies: ["service-a"] },
          ],
          tasks: [],
          build: { command: ["echo", "A"], dependencies: [] },
        },
        testConfigs: [],
        type: "test",
        taskConfigs: [],
      },
      {
        apiVersion: "garden.io/v0",
        kind: "Module",
        name: "module-b",
        include: [],
        build: { dependencies: [] },
        path: garden.projectRoot,
        serviceConfigs: [],
        disabled: false,
        allowPublish: false,
        spec: {
          services: [{ name: "service-b" }],
          tests: [
            { name: "unit", command: ["echo", "OK"] },
            { name: "integration", command: ["echo", "OK"], dependencies: ["service-a"] }, // <--- depends on service-a
          ],
          tasks: [],
          build: { command: ["echo", "A"], dependencies: [] },
        },
        testConfigs: [],
        type: "test",
        taskConfigs: [],
      },
    ]

    garden.setModuleConfigs(moduleConfigs)

    const { result, errors } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { modules: ["module-a"] },
      opts: withDefaultGlobalOpts({
        "name": undefined,
        "force": true,
        "force-build": false,
        "watch": false,
        "skip-dependants": true, // <----
      }),
    })

    if (errors) {
      throw errors[0]
    }

    expect(Object.keys(taskResultOutputs(result!)).sort()).to.eql([
      "build.module-a",
      "deploy.service-a",
      "get-service-status.service-a",
      "stage-build.module-a",
      "test.module-a.integration",
      "test.module-a.unit",
    ])
  })
})
