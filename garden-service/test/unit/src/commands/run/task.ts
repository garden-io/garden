import stripAnsi from "strip-ansi"
import { expect } from "chai"
import { omit } from "lodash"
import { RunTaskCommand } from "../../../../../src/commands/run/task"
import { makeTestGardenA, withDefaultGlobalOpts, expectError } from "../../../../helpers"

describe("RunTaskCommand", () => {
  const cmd = new RunTaskCommand()

  it("should run a task", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log

    const { result } = await cmd.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { task: "task-a" },
      opts: withDefaultGlobalOpts({ "force-build": false }),
    })

    const expected = {
      command: ["echo", "OK"],
      moduleName: "module-a",
      log: "echo OK",
      outputs: {
        log: "echo OK",
      },
      success: true,
      taskName: "task-a",
    }

    const omittedKeys = ["dependencyResults", "description", "type", "completedAt", "startedAt", "version"]

    expect(omit(result!.output, omittedKeys)).to.eql(expected)
  })

  it("should throw if the task is disabled", async () => {
    const garden = await makeTestGardenA()
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
    const garden = await makeTestGardenA()
    const log = garden.log

    await garden.scanModules()
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
})
