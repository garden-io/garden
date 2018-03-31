import { ConfigDeleteCommand } from "../../../../src/commands/config/delete"
import { expectErrorType, makeTestContextA } from "../../../helpers"

describe("ConfigDeleteCommand", () => {
  it("should delete a config variable", async () => {
    const ctx = await makeTestContextA()
    const command = new ConfigDeleteCommand()

    await ctx.setConfig(["project", "mykey"], "myvalue")

    await command.action(ctx, { key: "project.mykey" }, { env: undefined })

    await expectErrorType(
      async () => await ctx.getConfig(["project", "mykey"]),
      "not-found",
    )
  })

  it("should throw on invalid key", async () => {
    const ctx = await makeTestContextA()
    const command = new ConfigDeleteCommand()

    await expectErrorType(
      async () => await command.action(ctx, { key: "bla.mykey" }, { env: undefined }),
      "parameter",
    )
  })

  it("should throw on missing key", async () => {
    const ctx = await makeTestContextA()
    const command = new ConfigDeleteCommand()

    await expectErrorType(
      async () => await command.action(ctx, { key: "project.mykey" }, { env: undefined }),
      "not-found",
    )
  })
})
