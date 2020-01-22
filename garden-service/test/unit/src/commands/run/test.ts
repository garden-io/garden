import stripAnsi from "strip-ansi"
import { expect } from "chai"
import { omit } from "lodash"
import { makeTestGardenA, withDefaultGlobalOpts, expectError } from "../../../../helpers"
import { RunTestCommand } from "../../../../../src/commands/run/test"

describe("RunTestCommand", () => {
  const cmd = new RunTestCommand()

  it("should run a test", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log

    const { result } = await cmd.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { test: "unit", module: "module-a" },
      opts: withDefaultGlobalOpts({ "force-build": false }),
    })

    const expected = {
      command: ["echo", "OK"],
      moduleName: "module-a",
      log: "OK",
      success: true,
      testName: "unit",
    }

    expect(omit(result, ["completedAt", "startedAt", "version"])).to.eql(expected)
  })

  it("should throw if the test is disabled", async () => {
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
          args: { module: "module-a", test: "unit" },
          opts: withDefaultGlobalOpts({ "force": false, "force-build": false }),
        }),
      (err) =>
        expect(stripAnsi(err.message)).to.equal(
          "Test module-a.unit is disabled for the local environment. If you're sure you want to run it anyway, " +
            "please run the command again with the --force flag."
        )
    )
  })

  it("should allow running a disabled test with the --force flag", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log

    await garden.scanModules()
    garden["moduleConfigs"]["module-a"].disabled = true

    const { errors } = await cmd.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { module: "module-a", test: "unit" },
      opts: withDefaultGlobalOpts({ "force": true, "force-build": false }),
    })

    expect(errors).to.not.exist
  })
})
