import { expect } from "chai"
import { SetConfigCommand } from "../../../src/commands/set"
import { expectError, makeTestContextA } from "../../helpers"

describe("SetConfigCommand", () => {
  it("should set a config variable", async () => {
    const ctx = await makeTestContextA()
    const command = new SetConfigCommand()

    await command.action(ctx, { key: "project.mykey", value: "myvalue" })

    expect(await ctx.getConfig({ key: ["project", "mykey"] })).to.eql({ value: "myvalue" })
  })

  it("should throw on invalid key", async () => {
    const ctx = await makeTestContextA()
    const command = new SetConfigCommand()

    await expectError(
      async () => await command.action(ctx, { key: "bla.mykey", value: "ble" }),
      "parameter",
    )
  })
})
