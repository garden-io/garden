import { join } from "path"
import { Garden } from "../../../src/garden"
import { ScanCommand } from "../../../src/commands/scan"

describe("ScanCommand", () => {
  it("should successfully scan the hello-world project", async () => {
    const root = join(__dirname, "..", "..", "..", "..", "examples", "hello-world")
    const garden = await Garden.factory(root)
    const ctx = garden.getPluginContext()
    const command = new ScanCommand()

    await command.action({ garden, ctx, args: {}, opts: {} })
  })
})
