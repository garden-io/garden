import { expect } from "chai"
import { omit } from "lodash"
import { RunTaskCommand } from "../../../../../src/commands/run/task"
import { makeTestGardenA, withDefaultGlobalOpts } from "../../../../helpers"

describe("RunTaskCommand", () => {
  it("should run a task", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const cmd = new RunTaskCommand()

    const { result } = await cmd.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { task: "task-a" },
      opts: withDefaultGlobalOpts({ "force-build": false }),
    })

    const expected = {
      command: ["echo", "OK"],
      moduleName: "module-a",
      log: "echo OK",
      outputs: {
        log: "echo OK",
      },
      success: true,
      taskName: "task-a",
    }

    const omittedKeys = ["dependencyResults", "description", "type", "completedAt", "startedAt", "version"]

    expect(omit(result!.output, omittedKeys)).to.eql(expected)
  })
})
