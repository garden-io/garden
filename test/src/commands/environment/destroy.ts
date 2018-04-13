import { expect } from "chai"
import { join } from "path"
import * as td from "testdouble"

import { defaultPlugins } from "../../../../src/plugins"
import {
  DestroyEnvironmentParams,
  EnvironmentStatus,
  GetEnvironmentStatusParams,
  Plugin,
} from "../../../../src/types/plugin"
import { EnvironmentDestroyCommand } from "../../../../src/commands/environment/destroy"
import { Garden } from "../../../../src/garden"
import { Module } from "../../../../src/types/module"

class TestProvider implements Plugin<Module> {
  name = "test-plugin"
  supportedModuleTypes = ["generic", "container"]

  testEnvStatuses: { [key: string]: EnvironmentStatus } = {}

  async destroyEnvironment({ ctx, env }: DestroyEnvironmentParams): Promise<void> {
    this.testEnvStatuses[this.name] = {configured: false}
  }

  async getEnvironmentStatus({ env }: GetEnvironmentStatusParams): Promise<EnvironmentStatus> {
    return this.testEnvStatuses[this.name]
  }
}

class TestProviderSlow extends TestProvider {
  async destroyEnvironment({ ctx, env }: DestroyEnvironmentParams): Promise<void> {
    this.testEnvStatuses[this.name] = {configured: true}
  }
}

describe("EnvironmentDestroyCommand", () => {
  afterEach(() => {
    td.reset()
  })

  const projectRootB = join(__dirname, "..", "..", "..", "data", "test-project-b")
  const command = new EnvironmentDestroyCommand()

  it("should destroy environment", async () => {
    const garden = await Garden.factory(projectRootB, {
      plugins: defaultPlugins.concat([() => new TestProvider()]),
    })

    const result = await command.action(garden.pluginContext, {}, { env: undefined })

    expect(result["test-plugin"]["configured"]).to.be.false
  })

  it("should wait until each provider is no longer configured", async () => {
    const garden = await Garden.factory(projectRootB, {
      plugins: defaultPlugins.concat([() => new TestProviderSlow()]),
    })

    td.replace(
      command,
      "waitForShutdown",
      async () => ({
        "test-plugin": { configured: false },
      }),
    )

    const result = await command.action(garden.pluginContext, {}, { env: undefined })

    expect(result["test-plugin"]["configured"]).to.be.false
  })
})
