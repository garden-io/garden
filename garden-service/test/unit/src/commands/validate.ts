import { join } from "path"
import { Garden } from "../../../../src/garden"
import { ValidateCommand } from "../../../../src/commands/validate"
import { expectError, withDefaultGlobalOpts, dataDir, makeTestGardenA } from "../../../helpers"

describe("commands.validate", () => {
  it(`should successfully validate a test project`, async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const command = new ValidateCommand()

    await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: {},
      opts: withDefaultGlobalOpts({}),
    })
  })

  it("should fail validating the bad-project project", async () => {
    const root = join(dataDir, "validate", "bad-project")

    await expectError(async () => await Garden.factory(root), "configuration")
  })

  it("should fail validating the bad-module project", async () => {
    const root = join(dataDir, "validate", "bad-module")
    const garden = await Garden.factory(root)
    const log = garden.log
    const command = new ValidateCommand()

    await expectError(
      async () =>
        await command.action({
          garden,
          log,
          headerLog: log,
          footerLog: log,
          args: {},
          opts: withDefaultGlobalOpts({}),
        }),
      "configuration"
    )
  })
})
