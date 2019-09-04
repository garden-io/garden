import { RunModuleCommand } from "../../../../../src/commands/run/module"
import { RunResult } from "../../../../../src/types/plugin/base"
import { makeTestGardenA, testModuleVersion, testNow, withDefaultGlobalOpts } from "../../../../helpers"
import { expect } from "chai"
import { Garden } from "../../../../../src/garden"
import td from "testdouble"

describe("RunModuleCommand", () => {
  // TODO: test optional flags
  let garden
  let log

  beforeEach(async () => {
    td.replace(Garden.prototype, "resolveVersion", async () => testModuleVersion)
    garden = await makeTestGardenA()
    log = garden.log
  })

  it("should run a module without an arguments param", async () => {
    const cmd = new RunModuleCommand()
    const { result } = await cmd.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { module: "module-a", arguments: [] },
      opts: withDefaultGlobalOpts({
        "interactive": false,
        "force-build": false,
      }),
    })

    const expected: RunResult = {
      moduleName: "module-a",
      command: [],
      completedAt: testNow,
      log: "",
      version: testModuleVersion.versionString,
      startedAt: testNow,
      success: true,
    }

    expect(result).to.eql(expected)
  })

  it("should run a module with an arguments param", async () => {
    const cmd = new RunModuleCommand()
    const { result } = await cmd.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { module: "module-a", arguments: ["my", "command"] },
      opts: withDefaultGlobalOpts({
        "interactive": false,
        "force-build": false,
      }),
    })

    const expected: RunResult = {
      moduleName: "module-a",
      command: ["my", "command"],
      completedAt: testNow,
      log: "my command",
      version: testModuleVersion.versionString,
      startedAt: testNow,
      success: true,
    }

    expect(result).to.eql(expected)
  })

  it("should run a module with a command option", async () => {
    const cmd = new RunModuleCommand()
    const { result } = await cmd.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { module: "module-a", arguments: ["my", "command"] },
      opts: withDefaultGlobalOpts({
        "interactive": false,
        "force-build": false,
        "command": ["/bin/sh", "-c"],
      }),
    })

    const expected: RunResult = {
      moduleName: "module-a",
      command: ["/bin/sh", "-c", "my", "command"],
      completedAt: testNow,
      log: "/bin/sh -c my command",
      version: testModuleVersion.versionString,
      startedAt: testNow,
      success: true,
    }

    expect(result).to.eql(expected)
  })
})
