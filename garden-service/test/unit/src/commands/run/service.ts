import { RunServiceCommand } from "../../../../../src/commands/run/service"
import { RunResult } from "../../../../../src/types/plugin/base"
import { makeTestGardenA, testModuleVersion, testNow, withDefaultGlobalOpts } from "../../../../helpers"
import { expect } from "chai"
import { Garden } from "../../../../../src/garden"
import td from "testdouble"
import { LogEntry } from "../../../../../src/logger/log-entry"

describe("RunServiceCommand", () => {
  // TODO: test optional flags
  let garden
  let log: LogEntry

  beforeEach(async () => {
    td.replace(Garden.prototype, "resolveVersion", async () => testModuleVersion)
    garden = await makeTestGardenA()
    log = garden.log
  })

  it("should run a service", async () => {
    const cmd = new RunServiceCommand()
    const { result } = await cmd.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { service: "service-a" },
      opts: withDefaultGlobalOpts({ "force-build": false }),
    })

    const expected: RunResult = {
      moduleName: "module-a",
      command: ["service-a"],
      completedAt: testNow,
      log: "service-a",
      version: testModuleVersion.versionString,
      startedAt: testNow,
      success: true,
    }

    expect(result).to.eql(expected)
  })
})
