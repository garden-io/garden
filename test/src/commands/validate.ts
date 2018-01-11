import { join } from "path"
import { GardenContext } from "../../../src/context"
import { ValidateCommand } from "../../../src/commands/validate"

describe("commands.validate", () => {
  it("should validate the hello-world project", async () => {
    const root = join(__dirname, "..", "..", "..", "examples", "hello-world")
    const ctx = new GardenContext(root)
    const command = new ValidateCommand()

    await command.action(ctx)
  })
})
