import { RunModuleCommand } from "../../../../src/commands/run/module"
import { RunResult } from "../../../../src/types/plugin"
import {
  makeTestGardenA,
  makeTestModule,
  testModuleVersion,
  testNow,
} from "../../../helpers"
import { expect } from "chai"

describe("RunModuleCommand", () => {
  // TODO: test optional flags

  it("should run a module without a command param", async () => {
    const garden = await makeTestGardenA()
    const ctx = garden.pluginContext

    garden.addModule(makeTestModule(ctx, {
      name: "run-test",
    }))

    const cmd = new RunModuleCommand()
    const res = await cmd.action(
      ctx,
      { module: "run-test", command: undefined },
      { interactive: false, "force-build": false },
    )

    const expected: RunResult = {
      moduleName: "run-test",
      command: [],
      completedAt: testNow,
      output: "OK",
      version: testModuleVersion,
      startedAt: testNow,
      success: true,
    }

    expect(res).to.eql(expected)
  })

  it("should run a module with a command param", async () => {
    const garden = await makeTestGardenA()
    const ctx = garden.pluginContext

    garden.addModule(makeTestModule(ctx, {
      name: "run-test",
    }))

    const cmd = new RunModuleCommand()
    const res = await cmd.action(
      ctx,
      { module: "run-test", command: "my command" },
      { interactive: false, "force-build": false },
    )

    const expected: RunResult = {
      moduleName: "run-test",
      command: ["my", "command"],
      completedAt: testNow,
      output: "OK",
      version: testModuleVersion,
      startedAt: testNow,
      success: true,
    }

    expect(res).to.eql(expected)
  })
})
