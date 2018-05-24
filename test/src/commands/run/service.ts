import { RunServiceCommand } from "../../../../src/commands/run/service"
import { RunResult } from "../../../../src/types/plugin/outputs"
import {
  makeTestGardenA,
  makeTestModule,
  testModuleVersion,
  testNow,
} from "../../../helpers"
import { expect } from "chai"

describe("RunServiceCommand", () => {
  // TODO: test optional flags

  it("should run a service", async () => {
    const garden = await makeTestGardenA()
    const ctx = garden.pluginContext

    garden.addModule(makeTestModule(ctx, {
      name: "run-test",
    }))

    const cmd = new RunServiceCommand()
    const { result } = await cmd.action(
      ctx,
      { service: "testService" },
      { interactive: false, "force-build": false },
    )

    const expected: RunResult = {
      moduleName: "run-test",
      command: ["testService"],
      completedAt: testNow,
      output: "OK",
      version: testModuleVersion,
      startedAt: testNow,
      success: true,
    }

    expect(result).to.eql(expected)
  })
})
