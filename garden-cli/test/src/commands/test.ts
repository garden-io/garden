import { expect } from "chai"
import { TestCommand } from "../../../src/commands/test"
import * as isSubset from "is-subset"
import { makeTestGardenA, taskResultOutputs } from "../../helpers"

describe("commands.test", () => {
  it("should run all tests in a simple project", async () => {
    const garden = await makeTestGardenA()
    const ctx = garden.getPluginContext()
    const command = new TestCommand()

    const { result } = await command.action({
      garden,
      ctx,
      args: { module: undefined },
      opts: { name: undefined, force: true, "force-build": true, watch: false },
    })

    expect(isSubset(taskResultOutputs(result!), {
      "build.module-a": {
        fresh: true,
        buildLog: "A",
      },
      "test.module-a.unit": {
        success: true,
        output: "OK\n",
      },
      "build.module-b": {
        fresh: true,
        buildLog: "B",
      },
      "build.module-c": {},
      "test.module-b.unit": {
        success: true,
        output: "OK\n",
      },
      "test.module-c.unit": {
        success: true,
        output: "OK\n",
      },
    })).to.be.true
  })

  it("should optionally test single module", async () => {
    const garden = await makeTestGardenA()
    const ctx = garden.getPluginContext()
    const command = new TestCommand()

    const { result } = await command.action({
      garden,
      ctx,
      args: { module: ["module-a"] },
      opts: { name: undefined, force: true, "force-build": true, watch: false },
    })

    expect(isSubset(taskResultOutputs(result!), {
      "build.module-a": {
        fresh: true,
        buildLog: "A",
      },
      "test.module-a.unit": {
        success: true,
        output: "OK\n",
      },
    })).to.be.true
  })
})
