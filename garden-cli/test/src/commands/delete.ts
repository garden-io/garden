import {
  DeleteSecretCommand,
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

describe("DeleteSecretCommand", () => {
  const pluginName = "test-plugin"
  const provider = pluginName

  it("should delete a secret", async () => {
    const garden = await makeTestGardenA()
    const command = new DeleteSecretCommand()

    const key = "mykey"
    const value = "myvalue"

    await garden.actions.setSecret({ key, value, pluginName })

    await command.action({ garden, args: { provider, key }, opts: {} })

    expect(await garden.actions.getSecret({ pluginName, key })).to.eql({ value: null })
  })

  it("should throw on missing key", async () => {
    const garden = await makeTestGardenA()
    const command = new DeleteSecretCommand()

    await expectError(
      async () => await command.action({ garden, args: { provider, key: "foo" }, opts: {} }),
      "not-found",
    )
  })
})

describe("DeleteEnvironmentCommand", () => {
  const testProvider: PluginFactory = () => {
    const name = "test-plugin"

    const testEnvStatuses: { [key: string]: EnvironmentStatus } = {}

    const cleanupEnvironment = async () => {
      testEnvStatuses[name] = { ready: false }
      return {}
    }

    const getEnvironmentStatus = async () => {
      return testEnvStatuses[name]
    }

    return {
      actions: {
        cleanupEnvironment,
        getEnvironmentStatus,
      },
    }
  }

  testProvider.pluginName = "test-plugin"

  const projectRootB = getDataDir("test-project-b")
  const command = new DeleteEnvironmentCommand()

  it("should destroy environment", async () => {
    const garden = await Garden.factory(projectRootB, { plugins: [testProvider] })

    const { result } = await command.action({ garden, args: {}, opts: {} })

    expect(result!["test-plugin"]["ready"]).to.be.false
  })
})

describe("DeleteServiceCommand", () => {
  const testProvider: PluginFactory = () => {
    const testStatuses: { [key: string]: ServiceStatus } = {
      "service-a": {
        state: "unknown",
        ingresses: [],
      },
      "service-b": {
        state: "unknown",
        ingresses: [],
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

    const { result } = await command.action({ garden, args: { service: ["service-a"] }, opts: {} })
    expect(result).to.eql({
      "service-a": { state: "unknown", ingresses: [] },
    })
  })

  it("should return the status of the deleted services", async () => {
    const garden = await Garden.factory(projectRootB, { plugins: [testProvider] })

    const { result } = await command.action({ garden, args: { service: ["service-a", "service-b"] }, opts: {} })
    expect(result).to.eql({
      "service-a": { state: "unknown", ingresses: [] },
      "service-b": { state: "unknown", ingresses: [] },
    })
  })
})
