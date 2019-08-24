import {
  DeleteSecretCommand,
  DeleteEnvironmentCommand,
  DeleteServiceCommand,
} from "../../../../src/commands/delete"
import { Garden } from "../../../../src/garden"
import {
  expectError,
  makeTestGardenA,
  getDataDir,
  configureTestModule,
  withDefaultGlobalOpts,
} from "../../../helpers"
import { expect } from "chai"
import { ServiceStatus } from "../../../../src/types/service"
import { EnvironmentStatus } from "../../../../src/types/plugin/provider/getEnvironmentStatus"
import { DeleteServiceParams } from "../../../../src/types/plugin/service/deleteService"
import { createGardenPlugin } from "../../../../src/types/plugin/plugin"
import { testModuleSpecSchema } from "../../../helpers"

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

const getServiceStatus = async (): Promise<ServiceStatus> => {
  return { state: "ready", detail: {} }
}

describe("DeleteEnvironmentCommand", () => {
  let deletedServices: string[] = []

  const testProvider = createGardenPlugin(() => {
    const name = "test-plugin"

    const testEnvStatuses: { [key: string]: EnvironmentStatus } = {}

    const cleanupEnvironment = async () => {
      testEnvStatuses[name] = { ready: false, outputs: {} }
      return {}
    }

    const getEnvironmentStatus = async () => {
      return testEnvStatuses[name] || { ready: true, outputs: {} }
    }

    const deleteService = async ({ service }): Promise<ServiceStatus> => {
      deletedServices.push(service.name)
      return { state: "missing", detail: {} }
    }

    return {
      name: "test-plugin",
      handlers: {
        cleanupEnvironment,
        getEnvironmentStatus,
      },
      createModuleTypes: [{
        name: "test",
        docs: "Test plugin",
        schema: testModuleSpecSchema,
        handlers: {
          configure: configureTestModule,
          getServiceStatus,
          deleteService,
        },
      }],
    }
  })

  beforeEach(() => {
    deletedServices = []
  })

  const projectRootB = getDataDir("test-project-b")
  const command = new DeleteEnvironmentCommand()
  const plugins = [testProvider]

  it("should delete environment with services", async () => {
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

    expect(result!.environmentStatuses["test-plugin"]["ready"]).to.be.false
    expect(result!.serviceStatuses).to.eql({
      "service-a": { forwardablePorts: [], state: "missing", detail: {} },
      "service-b": { forwardablePorts: [], state: "missing", detail: {} },
      "service-c": { forwardablePorts: [], state: "missing", detail: {} },
      "service-d": { forwardablePorts: [], state: "missing", detail: {} },
    })
    expect(deletedServices.sort()).to.eql(["service-a", "service-b", "service-c", "service-d"])
  })
})

describe("DeleteServiceCommand", () => {
  const testProvider = createGardenPlugin(() => {
    const testStatuses: { [key: string]: ServiceStatus } = {
      "service-a": {
        state: "unknown",
        ingresses: [],
        detail: {},
      },
      "service-b": {
        state: "unknown",
        ingresses: [],
        detail: {},
      },
    }

    const deleteService = async (param: DeleteServiceParams) => {
      return testStatuses[param.service.name]
    }

    return {
      name: "test-plugin",
      createModuleTypes: [{
        name: "test",
        docs: "Test plugin",
        schema: testModuleSpecSchema,
        handlers: {
          configure: configureTestModule,
          getServiceStatus,
          deleteService,
        },
      }],
    }
  })

  const plugins = [testProvider]

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
      "service-a": { forwardablePorts: [], state: "unknown", ingresses: [], detail: {} },
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
      "service-a": { forwardablePorts: [], state: "unknown", ingresses: [], detail: {} },
      "service-b": { forwardablePorts: [], state: "unknown", ingresses: [], detail: {} },
    })
  })
})
