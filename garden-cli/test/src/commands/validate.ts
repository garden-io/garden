import { join } from "path"
import { Garden } from "../../../src/garden"
import { ValidateCommand } from "../../../src/commands/validate"
import { expectError } from "../../helpers"

describe("commands.validate", () => {
  it("should successfully validate the hello-world project", async () => {
    const root = join(__dirname, "..", "..", "..", "..", "examples", "hello-world")
    const garden = await Garden.factory(root)
    const ctx = garden.getPluginContext()
    const command = new ValidateCommand()

    await command.action({ garden, ctx, args: {}, opts: {} })
  })

  it("should fail validating the bad-project project", async () => {
    const root = join(__dirname, "data", "validate", "bad-project")

    await expectError(async () => await Garden.factory(root), "configuration")
  })

  it("should fail validating the bad-module project", async () => {
    const root = join(__dirname, "data", "validate", "bad-module")
    const garden = await Garden.factory(root)
    const ctx = garden.getPluginContext()
    const command = new ValidateCommand()

    await expectError(async () => await command.action({ garden, ctx, args: {}, opts: {} }), "configuration")
  })
})
