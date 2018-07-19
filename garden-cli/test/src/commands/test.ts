import { expect } from "chai"
import {
  makeTestContextA,
  taskResultOutputs,
} from "../../helpers"
import { TestCommand } from "../../../src/commands/test"
import * as isSubset from "is-subset"

describe("commands.test", () => {
  it("should run all tests in a simple project", async () => {
    const ctx = await makeTestContextA()
    const command = new TestCommand()

    const { result } = await command.action(
      ctx,
      { module: undefined },
      { name: undefined, force: true, "force-build": true, watch: false },
    )

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
    const ctx = await makeTestContextA()
    const command = new TestCommand()

    const { result } = await command.action(
      ctx,
      { module: "module-a" },
      { name: undefined, force: true, "force-build": true, watch: false },
    )

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
