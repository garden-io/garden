import { expect } from "chai"
import { join } from "path"

import {
  PluginFactory,
} from "../../../../src/types/plugin/plugin"
import { EnvironmentDestroyCommand } from "../../../../src/commands/environment/destroy"
import { Garden } from "../../../../src/garden"
import { EnvironmentStatus } from "../../../../src/types/plugin/outputs"

const testProvider: PluginFactory = () => {
  const name = "test-plugin"

  const testEnvStatuses: { [key: string]: EnvironmentStatus } = {}

  const destroyEnvironment = async () => {
    testEnvStatuses[name] = { configured: false }
    return {}
  }

  const getEnvironmentStatus = async () => {
    return testEnvStatuses[name]
  }

  return {
    actions: {
      destroyEnvironment,
      getEnvironmentStatus,
    },
  }
}

testProvider.pluginName = "test-plugin"

describe("EnvironmentDestroyCommand", () => {
  const projectRootB = join(__dirname, "..", "..", "..", "data", "test-project-b")
  const command = new EnvironmentDestroyCommand()

  it("should destroy environment", async () => {
    const garden = await Garden.factory(projectRootB, { plugins: [testProvider] })

    const { result } = await command.action(garden.pluginContext)

    expect(result!["test-plugin"]["configured"]).to.be.false
  })

})
