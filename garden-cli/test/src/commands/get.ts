import { expect } from "chai"
import { expectError, makeTestGardenA } from "../../helpers"
import { GetConfigCommand } from "../../../src/commands/get"

describe("GetConfigCommand", () => {
  it("should get a config variable", async () => {
    const garden = await makeTestGardenA()
    const ctx = garden.getPluginContext()
    const command = new GetConfigCommand()

    await ctx.setConfig({ key: ["project", "mykey"], value: "myvalue" })

    const res = await command.action({ garden, ctx, args: { key: "project.mykey" }, opts: {} })

    expect(res).to.eql({ "project.mykey": "myvalue" })
  })

  it("should throw on invalid key", async () => {
    const garden = await makeTestGardenA()
    const ctx = garden.getPluginContext()
    const command = new GetConfigCommand()

    await expectError(
      async () => await command.action({ garden, ctx, args: { key: "bla.mykey" }, opts: {} }),
      "parameter",
    )
  })

  it("should throw on missing key", async () => {
    const garden = await makeTestGardenA()
    const ctx = garden.getPluginContext()
    const command = new GetConfigCommand()

    await expectError(
      async () => await command.action({ garden, ctx, args: { key: "project.mykey" }, opts: {} }),
      "not-found",
    )
  })
})
