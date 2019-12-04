import { expect } from "chai"
import { InitCommand } from "../../../../src/commands/init"

describe("DevCommand", () => {
  it("should be protected", async () => {
    const command = new InitCommand()
    expect(command.protected).to.be.true
  })
})
