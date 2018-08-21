import {
  DeleteConfigCommand,
  DeleteEnvironmentCommand,
  DeleteServiceCommand,
} from "../../../src/commands/delete"
import { Garden } from "../../../src/garden"
import { EnvironmentStatus } from "../../../src/types/plugin/outputs"
import { PluginFactory } from "../../../src/types/plugin/plugin"
import { expectError, makeTestGardenA, getDataDir } from "../../helpers"
import { expect } from "chai"
import { ServiceStatus } from "../../../src/types/service"
import { DeleteServiceParams } from "../../../src/types/plugin/params"

describe("DeleteConfigCommand", () => {
  it("should delete a config variable", async () => {
    const garden = await makeTestGardenA()
    const ctx = garden.getPluginContext()
    const command = new DeleteConfigCommand()

    const key = ["project", "mykey"]
    const value = "myvalue"

    await ctx.setConfig({ key, value })

    await command.action({ garden, ctx, args: { key: "project.mykey" }, opts: {} })

    expect(await ctx.getConfig({ key })).to.eql({ value: null })
  })

  it("should throw on invalid key", async () => {
    const garden = await makeTestGardenA()
    const ctx = garden.getPluginContext()
    const command = new DeleteConfigCommand()

    await expectError(
      async () => await command.action({ garden, ctx, args: { key: "bla.mykey" }, opts: {} }),
      "parameter",
    )
  })

  it("should throw on missing key", async () => {
    const garden = await makeTestGardenA()
    const ctx = garden.getPluginContext()
    const command = new DeleteConfigCommand()

    await expectError(
      async () => await command.action({ garden, ctx, args: { key: "project.mykey" }, opts: {} }),
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

  const projectRootB = getDataDir("test-project-b")
  const command = new DeleteEnvironmentCommand()

  it("should destroy environment", async () => {
    const garden = await Garden.factory(projectRootB, { plugins: [testProvider] })
    const ctx = garden.getPluginContext()

    const { result } = await command.action({ garden, ctx, args: {}, opts: {} })

    expect(result!["test-plugin"]["configured"]).to.be.false
  })
})

describe("DeleteServiceCommand", () => {
  const testProvider: PluginFactory = () => {
    const testStatuses: { [key: string]: ServiceStatus } = {
      "service-a": {
        state: "unknown",
        endpoints: [],
      },
      "service-b": {
        state: "unknown",
        endpoints: [],
      },
    }

    const deleteService = async (param: DeleteServiceParams) => {
      return testStatuses[param.service.name]
    }

    return {
      moduleActions: {
        container: {
          deleteService,
        },
      },
    }
  }

  testProvider.pluginName = "test-plugin"

  const command = new DeleteServiceCommand()
  const projectRootB = getDataDir("test-project-b")

  it("should return the status of the deleted service", async () => {
    const garden = await Garden.factory(projectRootB, { plugins: [testProvider] })
    const ctx = garden.getPluginContext()

    const { result } = await command.action({ garden, ctx, args: { service: ["service-a"] }, opts: {} })
    expect(result).to.eql({
      "service-a": { state: "unknown", endpoints: [] },
    })
  })

  it("should return the status of the deleted services", async () => {
    const garden = await Garden.factory(projectRootB, { plugins: [testProvider] })
    const ctx = garden.getPluginContext()

    const { result } = await command.action({ garden, ctx, args: { service: ["service-a", "service-b"] }, opts: {} })
    expect(result).to.eql({
      "service-a": { state: "unknown", endpoints: [] },
      "service-b": { state: "unknown", endpoints: [] },
    })
  })
})
