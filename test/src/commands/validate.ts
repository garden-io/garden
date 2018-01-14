import { join } from "path"
import { GardenContext } from "../../../src/context"
import { ValidateCommand } from "../../../src/commands/validate"
import { expect } from "chai"

describe("commands.validate", () => {
  it("should successfully validate the hello-world project", async () => {
    const root = join(__dirname, "..", "..", "..", "examples", "hello-world")
    const ctx = new GardenContext(root)
    const command = new ValidateCommand()

    await command.action(ctx)
  })

  it("should fail validating the bad-project project", async () => {
    const root = join(__dirname, "data", "validate", "bad-project")

    try {
      new GardenContext(root)
    } catch (err) {
      expect(err.name).to.equal("ValidationError")
      return
    }

    throw new Error("Expected validation error")
  })

  it("should fail validating the bad-module project", async () => {
    const root = join(__dirname, "data", "validate", "bad-module")
    const ctx = new GardenContext(root)
    const command = new ValidateCommand()

    try {
      await command.action(ctx)
    } catch (err) {
      expect(err.name).to.equal("ValidationError")
      return
    }

    throw new Error("Expected validation error")
  })
})
