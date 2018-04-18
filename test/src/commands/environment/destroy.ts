import { expect } from "chai"
import { join } from "path"
import * as td from "testdouble"

import {
  EnvironmentStatus,
  PluginFactory,
} from "../../../../src/types/plugin"
import { EnvironmentDestroyCommand } from "../../../../src/commands/environment/destroy"
import { Garden } from "../../../../src/garden"

const testProvider: PluginFactory = () => {
  const name = "test-plugin"

  const testEnvStatuses: { [key: string]: EnvironmentStatus } = {}

  const destroyEnvironment = async () => {
    testEnvStatuses[name] = { configured: false }
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
  afterEach(() => {
    td.reset()
  })

  const projectRootB = join(__dirname, "..", "..", "..", "data", "test-project-b")
  const command = new EnvironmentDestroyCommand()

  it("should destroy environment", async () => {
    const garden = await Garden.factory(projectRootB, { plugins: [testProvider] })

    const result = await command.action(garden.pluginContext)

    expect(result["test-plugin"]["configured"]).to.be.false
  })

  it("should wait until each provider is no longer configured", async () => {
    const garden = await Garden.factory(projectRootB, { plugins: [testProvider] })

    td.replace(
      command,
      "waitForShutdown",
      async () => ({
        "test-plugin": { configured: false },
      }),
    )

    const result = await command.action(garden.pluginContext)

    expect(result["test-plugin"]["configured"]).to.be.false
  })
})
