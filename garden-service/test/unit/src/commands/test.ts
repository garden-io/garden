import { expect } from "chai"
import { TestCommand } from "../../../../src/commands/test"
import isSubset = require("is-subset")
import { makeTestGardenA, taskResultOutputs, withDefaultGlobalOpts } from "../../../helpers"

describe("TestCommand", () => {
  const command = new TestCommand()

  it("should run all tests in a simple project", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { modules: undefined },
      opts: withDefaultGlobalOpts({
        "name": undefined,
        "force": true,
        "force-build": true,
        "watch": false,
      }),
    })

    expect(
      isSubset(taskResultOutputs(result!), {
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
      })
    ).to.be.true
  })

  it("should optionally test single module", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { modules: ["module-a"] },
      opts: withDefaultGlobalOpts({
        "name": undefined,
        "force": true,
        "force-build": true,
        "watch": false,
      }),
    })

    expect(
      isSubset(taskResultOutputs(result!), {
        "build.module-a": {
          fresh: true,
          buildLog: "A",
        },
        "test.module-a.unit": {
          success: true,
          log: "OK",
        },
      })
    ).to.be.true
  })

  it("should only run integration tests if the option 'name' is specified with a glob", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { modules: ["module-a"] },
      opts: withDefaultGlobalOpts({
        "name": "int*",
        "force": true,
        "force-build": true,
        "watch": false,
      }),
    })

    expect(
      isSubset(taskResultOutputs(result!), {
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
      })
    ).to.be.true

    expect(
      isSubset(taskResultOutputs(result!), {
        "test.module-a.unit": {
          success: true,
          log: "OK",
        },
        "test.module-c.unit": {
          success: true,
          log: "OK",
        },
      })
    ).to.be.false
  })

  it("should be protected", async () => {
    expect(command.protected).to.be.true
  })

  it("should skip disabled tests", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log

    await garden.scanModules()
    garden["moduleConfigs"]["module-c"].spec.tests[0].disabled = true

    const { result, errors } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { modules: ["module-c"] },
      opts: withDefaultGlobalOpts({
        "force": true,
        "force-build": false,
        "watch": false,
      }),
    })

    if (errors) {
      throw errors[0]
    }

    expect(Object.keys(taskResultOutputs(result!)).sort()).to.eql([
      "build.module-a",
      "build.module-b",
      "build.module-c",
      "stage-build.module-a",
      "stage-build.module-b",
      "stage-build.module-c",
      "test.module-c.integ",
    ])
  })

  it("should skip tests from disabled modules", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log

    await garden.scanModules()
    garden["moduleConfigs"]["module-c"].disabled = true

    const { result, errors } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { modules: undefined },
      opts: withDefaultGlobalOpts({
        "force": true,
        "force-build": false,
        "watch": false,
      }),
    })

    if (errors) {
      throw errors[0]
    }

    expect(Object.keys(taskResultOutputs(result!)).sort()).to.eql([
      "build.module-a",
      "build.module-b",
      "stage-build.module-a",
      "stage-build.module-b",
      "test.module-a.integration",
      "test.module-a.unit",
      "test.module-b.unit",
    ])
  })
})
