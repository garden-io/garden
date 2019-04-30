import { expect } from "chai"
import { omit } from "lodash"
import { RunTaskCommand } from "../../../../../src/commands/run/task"
import { makeTestGardenA } from "../../../../helpers"

describe("RunTaskCommand", () => {

  it("should run a task", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const cmd = new RunTaskCommand()

    const { result } = await cmd.action({
      garden,
      log,
      logFooter: log,
      args: { task: "task-a" },
      opts: { "force-build": false },
    })

    const expected = {
      command: ["echo", "OK"],
      moduleName: "module-a",
      output: "OK",
      success: true,
      taskName: "task-a",
    }

    const omittedKeys = [
      "dependencyResults",
      "description",
      "type",
      "completedAt",
      "startedAt",
      "version",
    ]

    expect(omit(result!.output, omittedKeys)).to.eql(expected)
  })

})
