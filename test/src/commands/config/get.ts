import { expect } from "chai"
import { expectError, makeTestContextA } from "../../../helpers"
import { ConfigGetCommand } from "../../../../src/commands/config/get"

describe("ConfigGetCommand", () => {
  it("should get a config variable", async () => {
    const ctx = await makeTestContextA()
    const command = new ConfigGetCommand()

    await ctx.setConfig(["project", "mykey"], "myvalue")

    const res = await command.action(ctx, { key: "project.mykey" })

    expect(res).to.eql({ "project.mykey": "myvalue" })
  })

  it("should throw on invalid key", async () => {
    const ctx = await makeTestContextA()
    const command = new ConfigGetCommand()

    await expectError(
      async () => await command.action(ctx, { key: "bla.mykey" }),
      "parameter",
    )
  })

  it("should throw on missing key", async () => {
    const ctx = await makeTestContextA()
    const command = new ConfigGetCommand()

    await expectError(
      async () => await command.action(ctx, { key: "project.mykey" }),
      "not-found",
    )
  })
})
