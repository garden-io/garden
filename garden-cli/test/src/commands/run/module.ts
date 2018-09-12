import { RunModuleCommand } from "../../../../src/commands/run/module"
import { RunResult } from "../../../../src/types/plugin/outputs"
import {
  makeTestGardenA,
  makeTestModule,
  testModuleVersion,
  testNow,
} from "../../../helpers"
import { expect } from "chai"
import { Garden } from "../../../../src/garden"
import * as td from "testdouble"

describe("RunModuleCommand", () => {
  // TODO: test optional flags
  let garden

  beforeEach(async () => {
    td.replace(Garden.prototype, "resolveVersion", async () => testModuleVersion)
    garden = await makeTestGardenA()
  })

  it("should run a module without a command param", async () => {
    await garden.addModule(makeTestModule({
      name: "run-test",
      path: garden.projectRoot,
    }))

    const cmd = new RunModuleCommand()
    const { result } = await cmd.action({
      garden,
      args: { module: "run-test", command: [] },
      opts: { interactive: false, "force-build": false },
    })

    const expected: RunResult = {
      moduleName: "run-test",
      command: [],
      completedAt: testNow,
      output: "OK",
      version: testModuleVersion,
      startedAt: testNow,
      success: true,
    }

    expect(result).to.eql(expected)
  })

  it("should run a module with a command param", async () => {
    garden.addModule(makeTestModule({
      name: "run-test",
      path: garden.projectRoot,
    }))

    const cmd = new RunModuleCommand()
    const { result } = await cmd.action({
      garden,
      args: { module: "run-test", command: ["my", "command"] },
      opts: { interactive: false, "force-build": false },
    })

    const expected: RunResult = {
      moduleName: "run-test",
      command: ["my", "command"],
      completedAt: testNow,
      output: "OK",
      version: testModuleVersion,
      startedAt: testNow,
      success: true,
    }

    expect(result).to.eql(expected)
  })
})
