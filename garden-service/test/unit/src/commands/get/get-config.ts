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
      headerLog: log,
      footerLog: log,
      args: { provider },
      opts: withDefaultGlobalOpts({}),
    })

    const providers = await garden.resolveProviders()

    const config = {
      environmentName: garden.environmentName,
      providers,
      variables: garden.variables,
      moduleConfigs: sortBy(await garden["resolveModuleConfigs"](log), "name"),
      projectRoot: garden.projectRoot,
    }

    expect(config).to.deep.equal(res.result)
  })
})
