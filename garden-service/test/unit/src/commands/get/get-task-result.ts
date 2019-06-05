import { dataDir, makeTestGarden, expectError, withDefaultGlobalOpts } from "../../../../helpers"
import { resolve } from "path"
import { GetTaskResultCommand } from "../../../../../src/commands/get/get-task-result"
import { expect } from "chai"
import { pick } from "lodash"

describe("GetTaskResultCommand", () => {
  it("should throw error if task not found", async () => {
    const name = "imaginary-task"

    const garden = await makeTestGarden(
      resolve(dataDir, "test-project-dependants"),
    )
    const log = garden.log
    const command = new GetTaskResultCommand()

    await expectError(
      async () =>
        await command.action({
          garden,
          log,
          args: { name },
          opts: withDefaultGlobalOpts({}),
          logFooter: log,
        }),
      "parameter",
    )
  })

  it("should return the task result", async () => {
    const name = "task-c"

    const garden = await makeTestGarden(resolve(dataDir, "test-project-a"))
    const log = garden.log
    const command = new GetTaskResultCommand()

    const res = await command.action({
      garden,
      log,
      args: { name },
      opts: withDefaultGlobalOpts({}),
      logFooter: log,
    })

    expect(pick(res.result, ["output", "name"])).to.eql({ output: null, name })
  })
})
