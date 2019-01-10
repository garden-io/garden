import { expect } from "chai"
import { VersionCommand } from "../../../src/commands/version"
import { makeTestGardenA } from "../../helpers"

describe("VersionCommand", () => {
  it("should return the current package's version", async () => {
    const command = new VersionCommand()
    const garden = await makeTestGardenA()
    const log = garden.log
    const result = await command.action({
      log,
      garden,
      args: {},
      opts: {},
    })

    expect(result.result).to.eql(require("../../../package.json").version)
  })
})
