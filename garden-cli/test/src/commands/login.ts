import { expect } from "chai"
import { makeTestGardenA, stubAction } from "../../helpers"
import * as td from "testdouble"

import { LoginCommand } from "../../../src/commands/login"

describe("LoginCommand", () => {

  afterEach(async () => {
    td.reset()
  })

  const command = new LoginCommand()

  it("should log in to provider", async () => {
    const garden = await makeTestGardenA()
    const ctx = garden.getPluginContext()

    stubAction(garden, "test-plugin", "login", async () => ({ loggedIn: true }))
    stubAction(garden, "test-plugin", "getLoginStatus", async () => ({ loggedIn: true }))

    const { result } = await command.action({ garden, ctx, args: {}, opts: {} })

    expect(result).to.eql({ "test-plugin": { loggedIn: true } })
  })

})
