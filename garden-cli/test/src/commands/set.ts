import { expect } from "chai"
import { SetSecretCommand } from "../../../src/commands/set"
import { makeTestGardenA } from "../../helpers"

describe("SetSecretCommand", () => {
  const pluginName = "test-plugin"
  const provider = pluginName

  it("should set a config variable", async () => {
    const garden = await makeTestGardenA()
    const command = new SetSecretCommand()

    await command.action({ garden, args: { provider, key: "mykey", value: "myvalue" }, opts: {} })

    expect(await garden.actions.getSecret({ pluginName, key: "mykey" })).to.eql({ value: "myvalue" })
  })
})
