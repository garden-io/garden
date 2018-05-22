import { ConfigDeleteCommand } from "../../../../src/commands/config/delete"
import { expectError, makeTestContextA } from "../../../helpers"
import { expect } from "chai"

describe("ConfigDeleteCommand", () => {
  it("should delete a config variable", async () => {
    const ctx = await makeTestContextA()
    const command = new ConfigDeleteCommand()

    const key = ["project", "mykey"]
    const value = "myvalue"

    await ctx.setConfig({ key, value })

    await command.action(ctx, { key: "project.mykey" })

    expect(await ctx.getConfig({ key })).to.eql({ value: null })
  })

  it("should throw on invalid key", async () => {
    const ctx = await makeTestContextA()
    const command = new ConfigDeleteCommand()

    await expectError(
      async () => await command.action(ctx, { key: "bla.mykey" }),
      "parameter",
    )
  })

  it("should throw on missing key", async () => {
    const ctx = await makeTestContextA()
    const command = new ConfigDeleteCommand()

    await expectError(
      async () => await command.action(ctx, { key: "project.mykey" }),
      "not-found",
    )
  })
})
