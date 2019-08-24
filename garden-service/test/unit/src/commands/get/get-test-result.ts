import {
  expectError,
  withDefaultGlobalOpts,
  configureTestModule,
  makeTestGardenA,
} from "../../../../helpers"
import { GetTestResultCommand } from "../../../../../src/commands/get/get-test-result"
import { expect } from "chai"
import { GetTestResultParams } from "../../../../../src/types/plugin/module/getTestResult"
import { Garden } from "../../../../../src/garden"
import { LogEntry } from "../../../../../src/logger/log-entry"
import { createGardenPlugin } from "../../../../../src/types/plugin/plugin"
import { joi } from "../../../../../src/config/common"

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

const testPlugin = createGardenPlugin({
  name: "test-plugin",
  createModuleTypes: [{
    name: "test",
    docs: "test",
    schema: joi.object(),
    handlers: {
      configure: configureTestModule,
      getTestResult: async (params: GetTestResultParams) => testResults[params.testName],
    },
  }],
})

describe("GetTestResultCommand", () => {
  let garden: Garden
  let log: LogEntry
  const command = new GetTestResultCommand()
  const module = "module-a"

  before(async () => {
    garden = await makeTestGardenA([testPlugin])
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
