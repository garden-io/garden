import {
  expectError,
  withDefaultGlobalOpts,
  configureTestModule,
  makeTestGardenA,
} from "../../../../helpers"
import { GetTestResultCommand } from "../../../../../src/commands/get/get-test-result"
import { expect } from "chai"
import { PluginFactory } from "../../../../../src/types/plugin/plugin"
import { GetTestResultParams } from "../../../../../src/types/plugin/module/getTestResult"
import { Garden } from "../../../../../src/garden"
import { LogEntry } from "../../../../../src/logger/log-entry"

const now = new Date()

const testResults = {
  unit: {
    moduleName: "module-a",
    command: [],
    completedAt: now,
    log: "bla bla",
    outputs: {
      log: "bla bla",
    },
    success: true,
    startedAt: now,
    testName: "unit",
    version: "1234",
  },
  integration: null,
}

const testPlugin: PluginFactory = async () => ({
  moduleActions: {
    test: {
      configure: configureTestModule,
      getTestResult: async (params: GetTestResultParams) => testResults[params.testName],
    },
  },
})

describe("GetTestResultCommand", () => {
  let garden: Garden
  let log: LogEntry
  const command = new GetTestResultCommand()
  const module = "module-a"

  before(async () => {
    const plugins = { "test-plugin": testPlugin }
    garden = await makeTestGardenA(plugins)
    log = garden.log
  })

  it("should throw error if test not found", async () => {
    const name = "banana"

    await expectError(
      async () =>
        await command.action({
          garden,
          log,
          headerLog: log,
          footerLog: log,
          args: { name, module },
          opts: withDefaultGlobalOpts({}),
        }),
      "not-found",
    )
  })

  it("should return the test result", async () => {
    const name = "unit"

    const res = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { name, module },
      opts: withDefaultGlobalOpts({}),
    })

    expect(res.result).to.eql({
      moduleName: "module-a",
      command: [],
      completedAt: now,
      log: "bla bla",
      outputs: {
        log: "bla bla",
      },
      success: true,
      startedAt: now,
      testName: "unit",
      version: "1234",
    })
  })

  it("should return result null if test result does not exist", async () => {
    const name = "integration"

    const res = await command.action({
      garden,
      log,
      footerLog: log,
      headerLog: log,
      args: { name, module },
      opts: withDefaultGlobalOpts({}),
    })

    expect(res.result).to.be.null
  })

})
