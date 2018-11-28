import { RunServiceCommand } from "../../../../src/commands/run/service"
import { RunResult } from "../../../../src/types/plugin/outputs"
import {
  makeTestGardenA,
  makeTestModule,
  testModuleVersion,
  testNow,
} from "../../../helpers"
import { expect } from "chai"
import { Garden } from "../../../../src/garden"
import * as td from "testdouble"
import { LogEntry } from "../../../../src/logger/log-entry"

describe("RunServiceCommand", () => {
  // TODO: test optional flags
  let garden
  let log: LogEntry

  beforeEach(async () => {
    td.replace(Garden.prototype, "resolveVersion", async () => testModuleVersion)
    garden = await makeTestGardenA()
    log = garden.log
  })

  it("should run a service", async () => {
    garden.addModule(makeTestModule({
      name: "run-test",
      serviceConfigs: [{ name: "test-service", dependencies: [], outputs: {}, spec: {} }],
    }))

    const cmd = new RunServiceCommand()
    const { result } = await cmd.action({
      garden,
      log,
      args: { service: "test-service" },
      opts: { "force-build": false },
    })

    const expected: RunResult = {
      moduleName: "run-test",
      command: ["test-service"],
      completedAt: testNow,
      output: "OK",
      version: testModuleVersion,
      startedAt: testNow,
      success: true,
    }

    expect(result).to.eql(expected)
  })
})
