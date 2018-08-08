import { expect } from "chai"
import { SetConfigCommand } from "../../../src/commands/set"
import { expectError, makeTestGardenA } from "../../helpers"

describe("SetConfigCommand", () => {
  it("should set a config variable", async () => {
    const garden = await makeTestGardenA()
    const ctx = garden.getPluginContext()
    const command = new SetConfigCommand()

    await command.action({ garden, ctx, args: { key: "project.mykey", value: "myvalue" }, opts: {} })

    expect(await ctx.getConfig({ key: ["project", "mykey"] })).to.eql({ value: "myvalue" })
  })

  it("should throw on invalid key", async () => {
    const garden = await makeTestGardenA()
    const ctx = garden.getPluginContext()
    const command = new SetConfigCommand()

    await expectError(
      async () => await command.action({ garden, ctx, args: { key: "bla.mykey", value: "ble" }, opts: {} }),
      "parameter",
    )
  })
})
