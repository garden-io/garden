/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import stripAnsi from "strip-ansi"
import { expect } from "chai"
import { omit } from "lodash"
import { RunTaskCommand } from "../../../../../src/commands/run/task"
import {
  withDefaultGlobalOpts,
  expectError,
  getLogMessages,
  TestGarden,
  projectRootA,
  testPlugin,
  projectTestFailsRoot,
  testPluginB,
} from "../../../../helpers"
import { LogLevel } from "../../../../../src/logger/log-node"
import { renderDivider } from "../../../../../src/logger/util"
import { dedent } from "../../../../../src/util/string"
import { runExecTask } from "../../../../../src/plugins/exec"
import { createGardenPlugin } from "../../../../../src/types/plugin/plugin"

describe("RunTaskCommand", () => {
  const cmd = new RunTaskCommand()

  const basePlugin = testPlugin()

  // Use the runExecTask handler
  const testExecPlugin = createGardenPlugin({
    ...basePlugin,
    createModuleTypes: [
      {
        ...basePlugin.createModuleTypes![0],
        handlers: {
          ...basePlugin.createModuleTypes![0].handlers,
          runTask: runExecTask,
        },
      },
    ],
  })

  const testExecPluginB = createGardenPlugin({
    ...testPluginB(),
    extendModuleTypes: [
      {
        name: "test",
        handlers: testExecPlugin.createModuleTypes![0].handlers,
      },
    ],
  })

  async function makeExecTestGarden(projectRoot: string = projectRootA) {
    return TestGarden.factory(projectRoot, {
      plugins: [testExecPlugin, testExecPluginB],
    })
  }

  it("should run a task", async () => {
    const garden = await makeExecTestGarden()
    const log = garden.log

    const { result } = await cmd.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { task: "task-a" },
      opts: withDefaultGlobalOpts({ "force": false, "force-build": false }),
    })

    expect(cmd.outputsSchema().validate(result).error).to.be.undefined

    const expected = {
      aborted: false,
      command: ["echo", "OK"],
      moduleName: "module-a",
      log: "OK",
      outputs: {
        log: "OK",
      },
      success: true,
      error: undefined,
      taskName: "task-a",
    }

    expect(result!.result.durationMsec).to.gte(0)
    expect(result!.result.startedAt).to.be.a("Date")
    expect(result!.result.completedAt).to.be.a("Date")
    expect(result!.result.version).to.be.a("string")

    const omittedKeys = ["durationMsec", "completedAt", "startedAt", "version"]

    expect(omit(result!.result, omittedKeys)).to.eql(expected)
  })

  it("should return an error if the task fails", async () => {
    const garden = await makeExecTestGarden(projectTestFailsRoot)
    const log = garden.log

    const result = await cmd.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { task: "task" },
      opts: withDefaultGlobalOpts({ "force": false, "force-build": false }),
    })

    expect(result.errors).to.have.lengthOf(1)
  })

  it("should throw if the task is disabled", async () => {
    const garden = await makeExecTestGarden()
    const log = garden.log

    await garden.getRawModuleConfigs()
    garden["moduleConfigs"]["module-a"].disabled = true

    await expectError(
      () =>
        cmd.action({
          garden,
          log,
          headerLog: log,
          footerLog: log,
          args: { task: "task-a" },
          opts: withDefaultGlobalOpts({ "force": false, "force-build": false }),
        }),
      (err) =>
        expect(stripAnsi(err.message)).to.equal(
          "Task task-a is disabled for the local environment. If you're sure you want to run it anyway, " +
            "please run the command again with the --force flag."
        )
    )
  })

  it("should allow running a disabled task with --force flag", async () => {
    const garden = await makeExecTestGarden()
    const log = garden.log

    await garden.scanAndAddConfigs()
    garden["moduleConfigs"]["module-a"].disabled = true

    const { errors } = await cmd.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { task: "task-a" },
      opts: withDefaultGlobalOpts({ "force": true, "force-build": false }),
    })

    expect(errors).to.not.exist
  })

  it("should log the result if successful", async () => {
    const garden = await makeExecTestGarden()
    const log = garden.log

    await cmd.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { task: "task-a" },
      opts: withDefaultGlobalOpts({ "force": false, "force-build": false }),
    })

    const logOutput = getLogMessages(log, (entry) => entry.level === LogLevel.info).join("\n")

    expect(logOutput).to.include(dedent`
    \nTask output:
    ${renderDivider()}
    OK
    ${renderDivider()}

    Done! ✔️
    `)
  })

  it("should not log the result if error", async () => {
    const garden = await makeExecTestGarden()
    const log = garden.log

    await cmd.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { task: "task-a" },
      opts: withDefaultGlobalOpts({ "force": false, "force-build": false }),
    })

    const logOutput = getLogMessages(log, (entry) => entry.level === LogLevel.error).join("\n")

    expect(logOutput).to.not.include("Run task failed with error")
  })
})
