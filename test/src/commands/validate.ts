import { join } from "path"
import { Garden } from "../../../src/garden"
import { ValidateCommand } from "../../../src/commands/validate"
import { defaultPlugins } from "../../../src/plugins"
import { expectError } from "../../helpers"

describe("commands.validate", () => {
  it("should successfully validate the hello-world project", async () => {
    const root = join(__dirname, "..", "..", "..", "examples", "hello-world")
    const ctx = await Garden.factory(root, { plugins: defaultPlugins })
    const command = new ValidateCommand()

    await command.action(ctx)
  })

  it("should fail validating the bad-project project", async () => {
    const root = join(__dirname, "data", "validate", "bad-project")

    await expectError(async () => await Garden.factory(root), "configuration")
  })

  it("should fail validating the bad-module project", async () => {
    const root = join(__dirname, "data", "validate", "bad-module")
    const ctx = await Garden.factory(root, { plugins: defaultPlugins })
    const command = new ValidateCommand()

    await expectError(async () => await command.action(ctx), "configuration")
  })
})
