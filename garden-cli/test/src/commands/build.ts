import { BuildCommand } from "../../../src/commands/build"
import { expect } from "chai"
import { makeTestGardenA } from "../../helpers"
import { taskResultOutputs } from "../../helpers"

describe("commands.build", () => {
  it("should build all modules in a project", async () => {
    const garden = await makeTestGardenA()
    const ctx = garden.getPluginContext()
    const command = new BuildCommand()

    const { result } = await command.action({
      garden,
      ctx,
      args: { module: undefined },
      opts: { watch: false, force: true },
    })

    expect(taskResultOutputs(result!)).to.eql({
      "build.module-a": { fresh: true, buildLog: "A" },
      "build.module-b": { fresh: true, buildLog: "B" },
      "build.module-c": {},
    })
  })

  it("should optionally build single module and its dependencies", async () => {
    const garden = await makeTestGardenA()
    const ctx = garden.getPluginContext()
    const command = new BuildCommand()

    const { result } = await command.action({
      garden,
      ctx,
      args: { module: ["module-b"] },
      opts: { watch: false, force: true },
    })

    expect(taskResultOutputs(result!)).to.eql({
      "build.module-a": { fresh: true, buildLog: "A" },
      "build.module-b": { fresh: true, buildLog: "B" },
    })
  })
})
