import {
  DeleteSecretCommand,
  DeleteEnvironmentCommand,
  DeleteServiceCommand,
} from "../../../../src/commands/delete"
import { Garden } from "../../../../src/garden"
import { PluginFactory } from "../../../../src/types/plugin/plugin"
import { expectError, makeTestGardenA, getDataDir, configureTestModule, withDefaultGlobalOpts } from "../../../helpers"
import { expect } from "chai"
import { ServiceStatus } from "../../../../src/types/service"
import { EnvironmentStatus } from "../../../../src/types/plugin/provider/getEnvironmentStatus"
import { DeleteServiceParams } from "../../../../src/types/plugin/service/deleteService"

describe("DeleteSecretCommand", () => {
  const pluginName = "test-plugin"
  const provider = pluginName

  it("should delete a secret", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const command = new DeleteSecretCommand()

    const key = "mykey"
    const value = "myvalue"

    const actions = await garden.getActionHelper()
    await actions.setSecret({ log, key, value, pluginName })

    await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { provider, key },
      opts: withDefaultGlobalOpts({}),
    })

    expect(await actions.getSecret({ log, pluginName, key })).to.eql({ value: null })
  })

  it("should throw on missing key", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const command = new DeleteSecretCommand()

    await expectError(
      async () => await command.action({
        garden,
        log,
        headerLog: log,
        footerLog: log,
        args: { provider, key: "foo" },
        opts: withDefaultGlobalOpts({}),
      }),
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

  const projectRootB = getDataDir("test-project-b")
  const command = new DeleteEnvironmentCommand()
  const plugins = { "test-plugin": testProvider }

  it("should destroy environment", async () => {
    const garden = await Garden.factory(projectRootB, { plugins })
    const log = garden.log

    const { result } = await command.action({
      garden,
      log,
      footerLog: log,
      headerLog: log,
      args: {},
      opts: withDefaultGlobalOpts({}),
    })

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
        test: {
          configure: configureTestModule,
          deleteService,
        },
      },
    }
  }

  const plugins = { "test-plugin": testProvider }

  const command = new DeleteServiceCommand()
  const projectRootB = getDataDir("test-project-b")

  it("should return the status of the deleted service", async () => {
    const garden = await Garden.factory(projectRootB, { plugins })
    const log = garden.log

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { services: ["service-a"] },
      opts: withDefaultGlobalOpts({}),
    })
    expect(result).to.eql({
      "service-a": { state: "unknown", ingresses: [] },
    })
  })

  it("should return the status of the deleted services", async () => {
    const garden = await Garden.factory(projectRootB, { plugins })
    const log = garden.log

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { services: ["service-a", "service-b"] },
      opts: withDefaultGlobalOpts({}),
    })
    expect(result).to.eql({
      "service-a": { state: "unknown", ingresses: [] },
      "service-b": { state: "unknown", ingresses: [] },
    })
  })
})
