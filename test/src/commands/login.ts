import { expect } from "chai"
import { makeTestGardenA, stubAction } from "../../helpers"

import { LoginCommand } from "../../../src/commands/login"

describe("LoginCommand", () => {
  const command = new LoginCommand()

  it("should log in to provider", async () => {
    const garden = await makeTestGardenA()
    const ctx = garden.pluginContext

    stubAction(garden, "test-plugin", "login", async () => ({ loggedIn: true }))
    stubAction(garden, "test-plugin", "getLoginStatus", async () => ({ loggedIn: true }))

    const { result } = await command.action(ctx)

    expect(result).to.eql({"test-plugin": { loggedIn: true }})
  })

})
