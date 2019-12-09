import { expect } from "chai"
import { DevCommand } from "../../../../src/commands/dev"

describe("DevCommand", () => {
  it("should be protected", async () => {
    const command = new DevCommand()
    expect(command.protected).to.be.true
  })
})
