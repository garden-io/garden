import { RunServiceCommand } from "../../../../../src/commands/run/service"
import { RunResult } from "../../../../../src/types/plugin/base"
import { makeTestGardenA, testModuleVersion, testNow, withDefaultGlobalOpts, expectError } from "../../../../helpers"
import { expect } from "chai"
import { Garden } from "../../../../../src/garden"
import td from "testdouble"
import { LogEntry } from "../../../../../src/logger/log-entry"
import stripAnsi from "strip-ansi"

describe("RunServiceCommand", () => {
  // TODO: test optional flags
  let garden: Garden
  let log: LogEntry
  const cmd = new RunServiceCommand()

  beforeEach(async () => {
    td.replace(Garden.prototype, "resolveVersion", async () => testModuleVersion)
    garden = await makeTestGardenA()
    log = garden.log
  })

  it("should run a service", async () => {
    const { result } = await cmd.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { service: "service-a" },
      opts: withDefaultGlobalOpts({ "force": false, "force-build": false }),
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

  it("should throw if the service is disabled", async () => {
    await garden.getRawModuleConfigs()
    garden["moduleConfigs"]["module-a"].disabled = true

    await expectError(
      () =>
        cmd.action({
          garden,
          log,
          headerLog: log,
          footerLog: log,
          args: { service: "service-a" },
          opts: withDefaultGlobalOpts({ "force": false, "force-build": false }),
        }),
      (err) =>
        expect(stripAnsi(err.message)).to.equal(
          "Service service-a is disabled for the local environment. If you're sure you want to run it anyway, " +
            "please run the command again with the --force flag."
        )
    )
  })

  it("should allow running a disabled service with --force flag", async () => {
    await garden.scanModules()
    garden["moduleConfigs"]["module-a"].disabled = true

    const { errors } = await cmd.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { service: "service-a" },
      opts: withDefaultGlobalOpts({ "force": true, "force-build": false }),
    })

    expect(errors).to.not.exist
  })
})
