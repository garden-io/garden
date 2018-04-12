import { expect } from "chai"
import { ConfigSetCommand } from "../../../../src/commands/config/set"
import { expectError, makeTestContextA } from "../../../helpers"
import { ConfigGetCommand } from "../../../../src/commands/config/get"

describe("ConfigSetCommand", () => {
  it("should set a config variable", async () => {
    const ctx = await makeTestContextA()
    const command = new ConfigSetCommand()

    await command.action(ctx, { key: "project.mykey", value: "myvalue" }, { env: undefined })

    expect(await ctx.getConfig(["project", "mykey"])).to.equal("myvalue")
  })

  it("should throw on invalid key", async () => {
    const ctx = await makeTestContextA()
    const command = new ConfigSetCommand()

    await expectError(
      async () => await command.action(ctx, { key: "bla.mykey", value: "ble" }, { env: undefined }),
      "parameter",
    )
  })
})
