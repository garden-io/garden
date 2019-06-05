import { expect } from "chai"
import { makeTestGardenA, withDefaultGlobalOpts } from "../../../../helpers"
import { GetConfigCommand } from "../../../../../src/commands/get/get-config"
import { sortBy } from "lodash"

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
      logFooter: log,
      args: { provider },
      opts: withDefaultGlobalOpts({}),
    })

    const config = {
      environmentName: garden.environment.name,
      providers: garden.environment.providers,
      variables: garden.environment.variables,
      moduleConfigs: sortBy(await garden.resolveModuleConfigs(), "name"),
      path: garden.projectRoot,
    }

    expect(config).to.deep.equal(res.result)
  })
})
