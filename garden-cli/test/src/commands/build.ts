import { BuildCommand } from "../../../src/commands/build"
import { expect } from "chai"
import {
  makeTestContextA,
  taskResultOutputs,
} from "../../helpers"

describe("commands.build", () => {
  it("should build all modules in a project", async () => {
    const ctx = await makeTestContextA()
    const command = new BuildCommand()

    const { result } = await command.action(ctx, { module: undefined }, { watch: false, force: true })

    expect(taskResultOutputs(result!)).to.eql({
      "build.module-a": { fresh: true, buildLog: "A" },
      "build.module-b": { fresh: true, buildLog: "B" },
      "build.module-c": {},
    })
  })

  it("should optionally build single module and its dependencies", async () => {
    const ctx = await makeTestContextA()
    const command = new BuildCommand()

    const { result } = await command.action(ctx, { module: "module-b" }, { watch: false, force: true })

    expect(taskResultOutputs(result!)).to.eql({
      "build.module-a": { fresh: true, buildLog: "A" },
      "build.module-b": { fresh: true, buildLog: "B" },
    })
  })
})
