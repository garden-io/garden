import { join } from "path"
import {
  DeleteConfigCommand,
  DeleteEnvironmentCommand,
} from "../../../src/commands/delete"
import { Garden } from "../../../src/garden"
import { EnvironmentStatus } from "../../../src/types/plugin/outputs"
import { PluginFactory } from "../../../src/types/plugin/plugin"
import { expectError, makeTestContextA } from "../../helpers"
import { expect } from "chai"

describe("DeleteConfigCommand", () => {
  it("should delete a config variable", async () => {
    const ctx = await makeTestContextA()
    const command = new DeleteConfigCommand()

    const key = ["project", "mykey"]
    const value = "myvalue"

    await ctx.setConfig({ key, value })

    await command.action(ctx, { key: "project.mykey" })

    expect(await ctx.getConfig({ key })).to.eql({ value: null })
  })

  it("should throw on invalid key", async () => {
    const ctx = await makeTestContextA()
    const command = new DeleteConfigCommand()

    await expectError(
      async () => await command.action(ctx, { key: "bla.mykey" }),
      "parameter",
    )
  })

  it("should throw on missing key", async () => {
    const ctx = await makeTestContextA()
    const command = new DeleteConfigCommand()

    await expectError(
      async () => await command.action(ctx, { key: "project.mykey" }),
      "not-found",
    )
  })
})

describe("DeleteEnvironmentCommand", () => {
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

  const projectRootB = join(__dirname, "..", "..", "data", "test-project-b")
  const command = new DeleteEnvironmentCommand()

  it("should destroy environment", async () => {
    const garden = await Garden.factory(projectRootB, { plugins: [testProvider] })

    const { result } = await command.action(garden.pluginContext)

    expect(result!["test-plugin"]["configured"]).to.be.false
  })

})
