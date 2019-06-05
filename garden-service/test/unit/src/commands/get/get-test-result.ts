import { dataDir, makeTestGarden, expectError, withDefaultGlobalOpts } from "../../../../helpers"
import { resolve } from "path"
import { GetTestResultCommand } from "../../../../../src/commands/get/get-test-result"
import { expect } from "chai"
import { pick } from "lodash"

describe("GetTestResultCommand", () => {
  it("should throw error if test not found", async () => {
    const name = "test-run"
    const module = "test-module"

    const garden = await makeTestGarden(
      resolve(dataDir, "test-project-dependants"),
    )
    const log = garden.log
    const command = new GetTestResultCommand()

    await expectError(
      async () =>
        await command.action({
          garden,
          log,
          args: { name, module },
          opts: withDefaultGlobalOpts({}),
          logFooter: log,
        }),
      "parameter",
    )
  })

  it("should return the test result", async () => {
    const name = "unit"
    const module = "module-c"

    const garden = await makeTestGarden(resolve(dataDir, "test-project-a"))
    const log = garden.log
    const command = new GetTestResultCommand()

    const res = await command.action({
      garden,
      log,
      args: { name, module },
      opts: withDefaultGlobalOpts({}),
      logFooter: log,
    })

    expect(pick(res.result, ["output", "name", "module"])).to.eql({ output: null, name, module })
  })
})
