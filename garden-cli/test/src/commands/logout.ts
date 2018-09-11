import { expect } from "chai"
import { makeTestGardenA, stubAction } from "../../helpers"

import { LogoutCommand } from "../../../src/commands/logout"

describe("LogoutCommand", () => {
  const command = new LogoutCommand()

  it("should log out from a provider", async () => {
    const garden = await makeTestGardenA()

    stubAction(garden, "test-plugin", "logout", async () => ({ loggedIn: false }))
    stubAction(garden, "test-plugin", "getLoginStatus", async () => ({ loggedIn: false }))

    const { result } = await command.action({ garden, args: {}, opts: {} })

    expect(result).to.eql({ "test-plugin": { loggedIn: false } })
  })
})
