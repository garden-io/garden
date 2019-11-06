import { join } from "path"
import {
  dataDir,
  expectError,
  withDefaultGlobalOpts,
  configureTestModule,
  testModuleSpecSchema,
} from "../../../../helpers"
import { GetTaskResultCommand } from "../../../../../src/commands/get/get-task-result"
import { expect } from "chai"
import { createGardenPlugin } from "../../../../../src/types/plugin/plugin"
import { LogEntry } from "../../../../../src/logger/log-entry"
import { Garden } from "../../../../../src/garden"
import { GetTaskResultParams } from "../../../../../src/types/plugin/task/getTaskResult"

const now = new Date()

const taskResults = {
  "task-a": {
    moduleName: "module-a",
    taskName: "task-a",
    command: ["foo"],
    completedAt: now,
    log: "bla bla",
    outputs: {
      log: "bla bla",
    },
    success: true,
    startedAt: now,
    version: "1234",
  },
  "task-c": null,
}

const testPlugin = createGardenPlugin({
  name: "test-plugin",
  createModuleTypes: [
    {
      name: "test",
      docs: "test",
      schema: testModuleSpecSchema,
      handlers: {
        configure: configureTestModule,
        getTaskResult: async (params: GetTaskResultParams) => taskResults[params.task.name],
      },
    },
  ],
})

describe("GetTaskResultCommand", () => {
  let garden: Garden
  let log: LogEntry
  const command = new GetTaskResultCommand()

  before(async () => {
    const projectRootB = join(dataDir, "test-project-b")
    garden = await Garden.factory(projectRootB, { plugins: [testPlugin] })
    log = garden.log
  })

  it("should throw error if task not found", async () => {
    const name = "banana"

    await expectError(
      async () =>
        await command.action({
          garden,
          log,
          headerLog: log,
          footerLog: log,
          args: { name },
          opts: withDefaultGlobalOpts({}),
        }),
      "parameter"
    )
  })

  it("should return the task result", async () => {
    const name = "task-a"

    const res = await command.action({
      garden,
      log,
      footerLog: log,
      headerLog: log,
      args: { name },
      opts: withDefaultGlobalOpts({}),
    })

    expect(res.result).to.be.eql({
      moduleName: "module-a",
      taskName: "task-a",
      command: ["foo"],
      completedAt: now,
      log: "bla bla",
      outputs: { log: "bla bla" },
      success: true,
      startedAt: now,
      version: "1234",
    })
  })

  it("should return result null if task result does not exist", async () => {
    const name = "task-c"

    const res = await command.action({
      garden,
      log,
      footerLog: log,
      headerLog: log,
      args: { name },
      opts: withDefaultGlobalOpts({}),
    })

    expect(res.result).to.be.null
  })
})
