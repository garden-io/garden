/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { TestCommand } from "../../../../src/commands/test"
import {
  makeModuleConfig,
  makeTestGardenA,
  taskResultOutputs,
  TestGarden,
  withDefaultGlobalOpts,
  expectError,
  getAllProcessedTaskNames,
} from "../../../helpers"
import { ModuleConfig } from "../../../../src/config/module"
import { LogEntry } from "../../../../src/logger/log-entry"

describe("TestCommand", () => {
  const command = new TestCommand()

  let garden: TestGarden
  let log: LogEntry

  beforeEach(async () => {
    garden = await makeTestGardenA()
    log = garden.log
  })

  it("should run all tests in a simple project", async () => {
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

    expect(outputs["test.module-a-unit"].state).to.equal("ready")
    expect(outputs["test.module-a-integration"].state).to.equal("ready")
    expect(outputs["test.module-b-unit"].state).to.equal("ready")
    expect(outputs["test.module-c-unit"].state).to.equal("ready")
    expect(outputs["test.module-c-integ"].state).to.equal("ready")
  })

  it("should optionally test single module", async () => {
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
        "module": ["module-a"], // <---
      }),
    })

    expect(Object.keys(result!.graphResults).sort()).to.eql(["test.module-a-integration", "test.module-a-unit"])
  })

  it("should optionally run single test", async () => {
    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { names: ["module-a-unit"] }, // <---
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

    expect(Object.keys(result!.graphResults)).to.eql(["test.module-a-unit"])
  })

  it("should optionally skip tests by name", async () => {
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
        "skip": ["*int*"], // <-----
        "skip-dependencies": false,
        "skip-dependants": false,
        "interactive": false,
        "module": ["module-a"],
      }),
    })

    expect(result!.graphResults["test.module-a-integration"]).to.not.exist
  })

  it("handles --interactive option if single test name is specified", async () => {
    await garden.stubRouterAction("Test", "run", async ({ interactive }) => {
      return {
        state: "ready",
        detail: {
          success: true,
          log: `Interactive: ${interactive}`,
          startedAt: new Date(),
          completedAt: new Date(),
        },
        outputs: {},
      }
    })

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { names: ["module-a-unit"] },
      opts: withDefaultGlobalOpts({
        "name": undefined,
        "force": true,
        "force-build": true,
        "watch": false,
        "skip": undefined,
        "skip-dependencies": false,
        "skip-dependants": false,
        "interactive": true,
        "module": undefined,
      }),
    })

    expect(result?.graphResults["test.module-a-unit"]?.result.detail.log).to.equal("Interactive: true")
  })

  it("throws if --interactive option is set and no test name is specified in arguments", async () => {
    await expectError(
      () =>
        command.action({
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
            "skip": undefined,
            "skip-dependencies": false,
            "skip-dependants": false,
            "interactive": true,
            "module": undefined,
          }),
        }),
      (err) =>
        expect(err.message).to.equal("The --interactive/-i option can only be used if a single test is selected.")
    )
  })

  it("throws if --interactive option is set and multiple test names are specified in arguments", async () => {
    await expectError(
      () =>
        command.action({
          garden,
          log,
          headerLog: log,
          footerLog: log,
          args: { names: ["module-a-unit", "module-a-integration"] },
          opts: withDefaultGlobalOpts({
            "name": undefined,
            "force": true,
            "force-build": true,
            "watch": false,
            "skip": undefined,
            "skip-dependencies": false,
            "skip-dependants": false,
            "interactive": true,
            "module": undefined,
          }),
        }),
      (err) =>
        expect(err.message).to.equal("The --interactive/-i option can only be used if a single test is selected.")
    )
  })

  it("throws if --interactive option is set along with --watch", async () => {
    await expectError(
      () =>
        command.action({
          garden,
          log,
          headerLog: log,
          footerLog: log,
          args: { names: ["module-a-unit"] },
          opts: withDefaultGlobalOpts({
            "name": undefined,
            "force": true,
            "force-build": true,
            "watch": true,
            "skip": undefined,
            "skip-dependencies": false,
            "skip-dependants": false,
            "interactive": true,
            "module": undefined,
          }),
        }),
      (err) => expect(err.message).to.equal("The --interactive/-i option cannot be used with the --watch/-w flag.")
    )
  })

  it("should be protected", async () => {
    expect(command.protected).to.be.true
  })

  it("should skip disabled tests", async () => {
    await garden.scanAndAddConfigs()
    garden["moduleConfigs"]["module-c"].spec.tests[0].disabled = true

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
        "module": ["module-c"],
      }),
    })

    if (errors) {
      throw errors[0]
    }

    expect(Object.keys(taskResultOutputs(result!)).sort()).to.eql(["test.module-c-integ"])
  })

  it("should skip tests from disabled modules", async () => {
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
      "test.module-a-integration",
      "test.module-a-unit",
      "test.module-b-unit",
    ])
  })

  it("selects tests by glob from positional argument", async () => {
    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { names: ["module-a-*"] },
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

    expect(Object.keys(result!.graphResults).sort()).to.eql(["test.module-a-integration", "test.module-a-unit"])
  })

  it("concatenates positional args and --name flags", async () => {
    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { names: ["module-a-unit"] },
      opts: withDefaultGlobalOpts({
        "name": ["module-b-unit"],
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

    expect(Object.keys(result!.graphResults).sort()).to.eql(["test.module-a-unit", "test.module-b-unit"])
  })

  it("throws if --module filter specifies module that does not exist", async () => {
    await expectError(
      () =>
        command.action({
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
            "skip": undefined,
            "skip-dependencies": false,
            "skip-dependants": false,
            "interactive": false,
            "module": ["foo"],
          }),
        }),
      (err) => expect(err.message).to.equal("Could not find module(s): foo")
    )
  })

  context("when --skip-dependencies is passed", () => {
    it("should not process runtime dependencies", async () => {
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
        args: { names: ["module-a-*"] },
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

      const processed = getAllProcessedTaskNames(result!.graphResults)

      expect(processed).to.eql([
        "build.module-a",
        "resolve-action.build.module-a",
        "resolve-action.deploy.service-a",
        "resolve-action.test.module-a-integration",
        "resolve-action.test.module-a-unit",
        "test.module-a-integration",
        "test.module-a-unit",
      ])
    })
  })
})
