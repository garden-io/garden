import { expect } from "chai"
import { makeTestGardenA } from "../../../helpers"
import { GetConfigCommand } from "../../../../src/commands/get/get-config"
import { isSubset } from "../../../../src/util/is-subset"

describe("GetConfigCommand", () => {
  const pluginName = "test-plugin"
  const provider = pluginName

  it("should get the project configuration", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const command = new GetConfigCommand()

    const res = await command.action({
      garden,
      log,
      args: { provider },
      opts: {},
    })

    const config = {
      environmentName: garden.environment.name,
      providers: garden.environment.providers,
      variables: garden.environment.variables,
      modules: await garden.getModules(),
    }

    expect(isSubset(config, res.result)).to.be.true
  })
})
