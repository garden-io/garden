import { RunModuleCommand } from "../../../../../src/commands/run/module"
import { RunResult } from "../../../../../src/types/plugin/outputs"
import {
  makeTestGardenA,
  testModuleVersion,
  testNow,
} from "../../../../helpers"
import { expect } from "chai"
import { Garden } from "../../../../../src/garden"
import * as td from "testdouble"

describe("RunModuleCommand", () => {
  // TODO: test optional flags
  let garden
  let log

  beforeEach(async () => {
    td.replace(Garden.prototype, "resolveVersion", async () => testModuleVersion)
    garden = await makeTestGardenA()
    log = garden.log
  })

  it("should run a module without a command param", async () => {
    const cmd = new RunModuleCommand()
    const { result } = await cmd.action({
      garden,
      log,
      logFooter: log,
      args: { module: "module-a", command: [] },
      opts: { "interactive": false, "force-build": false },
    })

    const expected: RunResult = {
      moduleName: "module-a",
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
    const cmd = new RunModuleCommand()
    const { result } = await cmd.action({
      garden,
      log,
      logFooter: log,
      args: { module: "module-a", command: ["my", "command"] },
      opts: { "interactive": false, "force-build": false },
    })

    const expected: RunResult = {
      moduleName: "module-a",
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
