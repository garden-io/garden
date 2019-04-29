import { expect } from "chai"
import { dataDir, makeTestGarden } from "../../../../helpers"
import { GetGraphCommand } from "../../../../../src/commands/get/get-graph"
import { resolve } from "path"

describe("GetGraphCommand", () => {
  const pluginName = "test-plugin"
  const provider = pluginName

  // TODO: Switch to a stable topological sorting algorithm that's more amenable to testing.
  it("should get the project's serialized dependency graph", async () => {
    const garden = await makeTestGarden(resolve(dataDir, "test-project-dependants"))
    const log = garden.log
    const command = new GetGraphCommand()

    const res = await command.action({
      garden,
      log,
      logFooter: log,
      args: { provider },
      opts: {},
    })

    expect(Object.keys(res.result!).sort()).to.eql(["nodes", "relationships"])
  })
})
