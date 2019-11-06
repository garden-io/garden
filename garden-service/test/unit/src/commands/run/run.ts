import { RunCommand } from "../../../../../src/commands/run/run"
import { expect } from "chai"

describe("RunCommand", () => {
  it("should do nothing", async () => {
    const cmd = new RunCommand()
    const res = await cmd.action()
    expect(res).to.eql({})
  })

  it("should contain a set of subcommands", () => {
    const cmd = new RunCommand()
    const subcommandNames = cmd.subCommands.map((s) => new s().name)
    expect(subcommandNames).to.eql(["module", "service", "task", "test"])
  })
})
