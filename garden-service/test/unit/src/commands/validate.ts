import { join } from "path"
import { Garden } from "../../../../src/garden"
import { ValidateCommand } from "../../../../src/commands/validate"
import { expectError, getExampleProjects } from "../../../helpers"

describe("commands.validate", () => {
  // validate all of the example projects
  for (const [name, path] of Object.entries(getExampleProjects())) {
    it(`should successfully validate the ${name} project`, async () => {
      const garden = await Garden.factory(path)
      const log = garden.log
      const command = new ValidateCommand()

      await command.action({
        garden,
        log,
        logFooter: log,
        args: {},
        opts: {},
      })
    })
  }

  it("should fail validating the bad-project project", async () => {
    const root = join(__dirname, "data", "validate", "bad-project")

    await expectError(async () => await Garden.factory(root), "configuration")
  })

  it("should fail validating the bad-module project", async () => {
    const root = join(__dirname, "data", "validate", "bad-module")
    const garden = await Garden.factory(root)
    const log = garden.log
    const command = new ValidateCommand()

    await expectError(async () => await command.action({
      garden,
      log,
      logFooter: log,
      args: {},
      opts: {},
    }), "configuration")
  })
})
