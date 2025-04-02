/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { RunCommand } from "../../../../src/commands/run.js"
import type { TestGarden } from "../../../helpers.js"
import { expectError, getAllProcessedTaskNames, makeTestGarden, getDataDir, makeTestGardenA } from "../../../helpers.js"
import { expectLogsContain, getLogMessages } from "../../../../src/util/testing.js"
import { LogLevel } from "../../../../src/logger/logger.js"
import { DEFAULT_RUN_TIMEOUT_SEC, gardenEnv } from "../../../../src/constants.js"

// TODO-G2: fill in test implementations. use TestCommand tests for reference.

describe("RunCommand", () => {
  const command = new RunCommand()

  let garden: TestGarden

  beforeEach(async () => {
    garden = await makeTestGardenA()
  })

  it("should perform a single Run", async () => {
    const { result } = await garden.runCommand({
      command,
      args: { names: ["task-a"] },
      opts: {
        "force": true,
        "force-build": true,
        "watch": false,
        "skip": [],
        "skip-dependencies": false,
        "module": undefined,
      },
    })

    expect(Object.keys(result!.graphResults).sort()).to.eql(["run.task-a"])
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
      const { result } = await garden.runCommand({
        command,
        args: { names: ["task-a"] },
        opts: {
          "force": true,
          "force-build": true,
          "watch": false,
          "skip": [],
          "skip-dependencies": false,
          "module": undefined,
        },
      })

      const keys = getAllProcessedTaskNames(result!.graphResults)

      expect(keys).to.eql([
        "build.module-a",
        "resolve-action.build.module-a",
        "resolve-action.run.task-a",
        "run.task-a",
      ])
    })

    it("works with wildcard name", async () => {
      const { result } = await garden.runCommand({
        command,
        args: { names: ["*-a"] },
        opts: {
          "force": true,
          "force-build": true,
          "watch": false,
          "skip": [],
          "skip-dependencies": false,
          "module": undefined,
        },
      })

      const keys = getAllProcessedTaskNames(result!.graphResults)

      expect(keys).to.eql([
        "build.module-a",
        "resolve-action.build.module-a",
        "resolve-action.run.task-a",
        "run.task-a",
      ])
    })
  })

  it("should optionally skip tests by name", async () => {
    const { result } = await garden.runCommand({
      command,
      args: { names: ["task*"] },
      opts: {
        "force": true,
        "force-build": true,
        "watch": false,
        "skip": ["*-a*"],
        "skip-dependencies": false,
        "module": undefined,
      },
    })

    expect(Object.keys(result!.graphResults).sort()).to.eql(["run.task-b", "run.task-c"])
  })

  // it("handles --interactive option if single test name is specified", async () => {
  //   throw "TODO"
  // })

  // it("throws if --interactive option is set and no test name is specified in arguments", async () => {
  //   throw "TODO"
  // })

  // it("throws if --interactive option is set and multiple test names are specified in arguments", async () => {
  //   throw "TODO"
  // })

  it("throws if no name and no --module flag is set", async () => {
    await expectError(
      () =>
        garden.runCommand({
          command,
          args: { names: undefined },
          opts: {
            "force": true,
            "force-build": true,
            "watch": false,
            "skip": [],
            "skip-dependencies": false,
            "module": undefined,
          },
        }),
      {
        contains:
          "A name argument or --module must be specified. If you really want to perform every Run in the project, please specify '*' as an argument.",
      }
    )
  })

  it("supports '*' as an argument to select all Runs", async () => {
    const { result } = await garden.runCommand({
      command,
      args: { names: ["*"] },
      opts: {
        "force": true,
        "force-build": true,
        "watch": false,
        "skip": [],
        "skip-dependencies": false,
        "module": undefined,
      },
    })

    expect(Object.keys(result!.graphResults).sort()).to.eql(["run.task-a", "run.task-a2", "run.task-b", "run.task-c"])
  })

  it("should be protected", async () => {
    expect(command.protected).to.be.true
  })

  it("should skip disabled actions if --force is not set", async () => {
    garden.addAction({
      kind: "Run",
      type: "test",
      name: "task-disabled",
      disabled: true,
      internal: {
        basePath: garden.projectRoot,
      },
      timeout: DEFAULT_RUN_TIMEOUT_SEC,
      spec: {
        command: ["echo", "ok"],
      },
    })

    const { result } = await garden.runCommand({
      command,
      args: { names: ["*"] },
      opts: {
        "force": false,
        "force-build": false,
        "watch": false,
        "skip": [],
        "skip-dependencies": false,
        "module": undefined,
      },
    })

    expect(Object.keys(result!.graphResults)).to.not.include("task-disabled")
  })

  it("should run disabled actions if --force is set", async () => {
    await garden.scanAndAddConfigs()

    garden.addAction({
      kind: "Run",
      type: "test",
      name: "task-disabled",
      disabled: true,
      internal: {
        basePath: garden.projectRoot,
      },
      timeout: DEFAULT_RUN_TIMEOUT_SEC,
      spec: {
        command: ["echo", "ok"],
      },
    })

    const { result } = await garden.runCommand({
      command,
      args: { names: ["*"] },
      opts: {
        "force": true, // <----
        "force-build": false,
        "watch": false,
        "skip": [],
        "skip-dependencies": false,
        "module": undefined,
      },
    })

    expect(Object.keys(result!.graphResults)).to.include("run.task-disabled")
  })

  it("should skip actions from disabled modules", async () => {
    await garden.scanAndAddConfigs()

    garden["moduleConfigs"]["module-c"].disabled = true

    const { result } = await garden.runCommand({
      command,
      args: { names: ["*"] },
      opts: {
        "force": false,
        "force-build": false,
        "watch": false,
        "skip": [],
        "skip-dependencies": false,
        "module": undefined,
      },
    })

    expect(Object.keys(result!.graphResults)).to.not.include("run.task-c")
  })

  it("applies --module filter", async () => {
    const { result } = await garden.runCommand({
      command,
      args: { names: undefined },
      opts: {
        "force": true,
        "force-build": true,
        "watch": false,
        "skip": [],
        "skip-dependencies": false,
        "module": ["module-c"],
      },
    })

    expect(Object.keys(result!.graphResults).sort()).to.eql(["run.task-c"])
  })

  it("applies --module filter combined with name argument", async () => {
    const { result } = await garden.runCommand({
      command,
      args: { names: ["task*"] },
      opts: {
        "force": true,
        "force-build": true,
        "watch": false,
        "skip": [],
        "skip-dependencies": false,
        "module": ["module-b"],
      },
    })

    expect(Object.keys(result!.graphResults).sort()).to.eql(["run.task-b"])
  })

  it("throws if --module filter specifies module that does not exist", async () => {
    await expectError(
      () =>
        garden.runCommand({
          command,
          args: { names: undefined },
          opts: {
            "force": true,
            "force-build": true,
            "watch": false,
            "skip": [],
            "skip-dependencies": false,
            "module": ["foo"],
          },
        }),
      { contains: "Could not find module(s): foo" }
    )
  })

  context("when --skip-dependencies is passed", () => {
    it("should not process runtime dependencies", async () => {
      await garden.scanAndAddConfigs()

      garden["moduleConfigs"]["module-c"].spec.tasks[0].dependencies = ["service-b"]

      const { result } = await garden.runCommand({
        command,
        args: { names: ["task-c"] },
        opts: {
          "force": true,
          "force-build": true,
          "watch": false,
          "skip": [],
          "skip-dependencies": true, // <----
          "module": undefined,
        },
      })

      const processed = getAllProcessedTaskNames(result!.graphResults)

      expect(processed).to.eql([
        "build.module-a",
        "build.module-b",
        "build.module-c",
        "resolve-action.build.module-a",
        "resolve-action.build.module-b",
        "resolve-action.build.module-c",
        "resolve-action.deploy.service-a",
        "resolve-action.deploy.service-b",
        "resolve-action.run.task-c",
        "run.task-c",
      ])
    })
  })
})

// TODO: switch these back to expectError for 0.14 by reverting a commit from https://github.com/garden-io/garden/pull/4195
describe("RunCommand legacy invocations", () => {
  const command = new RunCommand()

  let garden: TestGarden

  beforeEach(async () => {
    garden = await makeTestGarden(getDataDir("test-projects", "old-style-run-invocations"))
  })

  context("detecting invocations to removed 0.12-era run subcommands", async () => {
    it("warns if called with 'test' as the first argument", async () => {
      const log = garden.log
      await garden.runCommand({
        command,
        args: { names: ["test", "module-a-unit"] },
        opts: {
          "force": true,
          "force-build": true,
          "watch": false,
          "skip": [],
          "skip-dependencies": false,
          "module": undefined,
        },
      })
      const logMessages = getLogMessages(log, (l) => l.level === LogLevel.warn)
      expectLogsContain(logMessages, "The run test command will be removed in Garden 0.14")
    })

    it("warns if called with 'task' as the first argument", async () => {
      const log = garden.log
      await garden.runCommand({
        command,
        args: { names: ["task", "task-a"] },
        opts: {
          "force": true,
          "force-build": true,
          "watch": false,
          "skip": [],
          "skip-dependencies": false,
          "module": undefined,
        },
      })
      const logMessages = getLogMessages(log, (l) => l.level === LogLevel.warn)
      expectLogsContain(logMessages, "The run task command will be removed in Garden 0.14")
    })

    it("warns if called with 'workflow' as the first argument", async () => {
      const log = garden.log
      try {
        await garden.runCommand({
          command,
          args: { names: ["workflow", "workflow-a"] },
          opts: {
            "force": true,
            "force-build": true,
            "watch": false,
            "skip": [],
            "skip-dependencies": false,
            "module": undefined,
          },
        })
      } catch (e) {
        // we get an output schema validation error here.
        // ignoring it for test purposes - we're only interested in the warning
      }
      const logMessages = getLogMessages(log, (l) => l.level === LogLevel.warn)
      expectLogsContain(logMessages, "The run workflow command will be removed in Garden 0.14")
    })
  })
})
