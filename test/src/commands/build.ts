import { BuildCommand } from "../../../src/commands/build"
import { expect } from "chai"
import { makeTestContextA } from "../../helpers"

describe("commands.build", () => {
  it("should build all modules in a project", async () => {
    const ctx = await makeTestContextA()
    const command = new BuildCommand()

    const result = await command.action(ctx, { module: undefined }, { force: true })

    expect(result).to.eql({
      "build.module-a": { fresh: true, buildLog: "A\n" },
      "build.module-b": { fresh: true, buildLog: "B\n" },
      "build.module-c": {},
    })
  })

  it("should optionally build single module and its dependencies", async () => {
    const ctx = await makeTestContextA()
    const command = new BuildCommand()

    const result = await command.action(ctx, { module: "module-b" }, { force: true })

    expect(result).to.eql({
      "build.module-a": { fresh: true, buildLog: "A\n" },
      "build.module-b": { fresh: true, buildLog: "B\n" },
    })
  })
})
