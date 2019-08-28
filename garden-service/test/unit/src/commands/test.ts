import { expect } from "chai"
import { TestCommand } from "../../../../src/commands/test"
import isSubset = require("is-subset")
import { makeTestGardenA, taskResultOutputs, withDefaultGlobalOpts } from "../../../helpers"

describe("commands.test", () => {
  it("should run all tests in a simple project", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const command = new TestCommand()

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { modules: undefined },
      opts: withDefaultGlobalOpts({ "name": undefined, "force": true, "force-build": true, "watch": false }),
    })

    expect(isSubset(taskResultOutputs(result!), {
      "build.module-a": {
        fresh: true,
        buildLog: "A",
      },
      "test.module-a.unit": {
        success: true,
        log: "OK",
      },
      "build.module-b": {
        fresh: true,
        buildLog: "B",
      },
      "build.module-c": {},
      "test.module-b.unit": {
        success: true,
        log: "OK",
      },
      "test.module-c.unit": {
        success: true,
        log: "OK",
      },
    })).to.be.true
  })

  it("should optionally test single module", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const command = new TestCommand()

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { modules: ["module-a"] },
      opts: withDefaultGlobalOpts({ "name": undefined, "force": true, "force-build": true, "watch": false }),
    })

    expect(isSubset(taskResultOutputs(result!), {
      "build.module-a": {
        fresh: true,
        buildLog: "A",
      },
      "test.module-a.unit": {
        success: true,
        log: "OK",
      },
    })).to.be.true
  })

  it("should only run integration tests if the option 'name' is specified with a glob", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const command = new TestCommand()

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { modules: ["module-a"] },
      opts: withDefaultGlobalOpts({ "name": "int*", "force": true, "force-build": true, "watch": false }),
    })

    expect(isSubset(taskResultOutputs(result!), {
      "build.module-a": {
        fresh: true,
        buildLog: "A",
      },
      "test.module-a.integration": {
        success: true,
        log: "OK",
      },
      "test.module-c.integ": {
        success: true,
        log: "OK",
      },
    })).to.be.true

    expect(isSubset(taskResultOutputs(result!), {
      "test.module-a.unit": {
        success: true,
        log: "OK",
      },
      "test.module-c.unit": {
        success: true,
        log: "OK",
      },
    })).to.be.false
  })
})
