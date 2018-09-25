import { expect } from "chai"
import { omit } from "lodash"
import { RunWorkflowCommand } from "../../../../src/commands/run/workflow"
import { makeTestGardenA } from "../../../helpers"

describe("RunWorkflowCommand", () => {

  it("should run a workflow", async () => {
    const garden = await makeTestGardenA()
    const cmd = new RunWorkflowCommand()

    const { result } = await cmd.action({
      garden,
      args: { task: "workflow-a" },
      opts: { "force-build": false },
    })

    const expected = {
      command: ["echo", "OK"],
      moduleName: "module-a",
      output: "OK",
      success: true,
      workflowName: "workflow-a",
    }

    const omittedKeys = ["completedAt", "startedAt", "version"]
    expect(omit(result, omittedKeys)).to.eql(expected)
  })

})
