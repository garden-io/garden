/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DeleteSecretCommand, DeleteEnvironmentCommand, DeleteDeployCommand } from "../../../../src/commands/delete"
import {
  expectError,
  makeTestGardenA,
  getDataDir,
  customizedTestPlugin,
  withDefaultGlobalOpts,
  makeTestGarden,
  makeModuleConfig,
  TestGarden,
} from "../../../helpers"
import { expect } from "chai"
import { ServiceStatus } from "../../../../src/types/service"
import { EnvironmentStatus } from "../../../../src/plugin/handlers/provider/getEnvironmentStatus"
import { ModuleConfig } from "../../../../src/config/module"
import { LogEntry } from "../../../../src/logger/log-entry"
import { execDeployActionSchema } from "../../../../src/plugins/exec/config"
import { ActionStatus } from "../../../../src/actions/base"

describe("DeleteSecretCommand", () => {
  const pluginName = "test-plugin"
  const provider = pluginName

  it("should delete a secret", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const command = new DeleteSecretCommand()

    const key = "mykey"
    const value = "myvalue"

    const actions = await garden.getActionRouter()
    await actions.provider.setSecret({ log, key, value, pluginName })

    await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { provider, key },
      opts: withDefaultGlobalOpts({}),
    })

    expect(await actions.provider.getSecret({ log, pluginName, key })).to.eql({
      value: null,
    })
  })

  it("should throw on missing key", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const command = new DeleteSecretCommand()

    await expectError(
      async () =>
        await command.action({
          garden,
          log,
          headerLog: log,
          footerLog: log,
          args: { provider, key: "foo" },
          opts: withDefaultGlobalOpts({}),
        }),
      "not-found"
    )
  })

  it("should be protected", async () => {
    const command = new DeleteSecretCommand()
    expect(command.protected).to.be.true
  })
})

const projectRootB = getDataDir("test-project-b")
const moduleConfigs: ModuleConfig[] = [
  makeModuleConfig(projectRootB, {
    name: "module-a",
    include: [],
    spec: {
      services: [{ name: "service-a" }],
      tests: [],
      tasks: [],
      build: { dependencies: [] },
    },
  }),
  makeModuleConfig(projectRootB, {
    name: "module-b",
    include: [],
    spec: {
      services: [{ name: "service-b", dependencies: ["service-a"] }],
      tests: [],
      tasks: [],
      build: { dependencies: [] },
    },
  }),
  makeModuleConfig(projectRootB, {
    name: "module-c",
    include: [],
    spec: {
      services: [{ name: "service-c", dependencies: ["service-b"] }],
      tests: [],
      tasks: [],
      build: { dependencies: [] },
    },
  }),
  makeModuleConfig(projectRootB, {
    name: "module-d",
    include: [],
    spec: {
      services: [{ name: "service-d", dependencies: ["service-c"] }],
      tests: [],
      tasks: [],
      build: { dependencies: [] },
    },
  }),
]

const getServiceStatus = async (): Promise<ServiceStatus> => {
  return { state: "ready", detail: {} }
}

describe("DeleteEnvironmentCommand", () => {
  let deletedServices: string[] = []
  let deleteOrder: string[] = []
  const testEnvStatuses: { [key: string]: EnvironmentStatus } = {}
  let garden: TestGarden
  let log: LogEntry

  const testProvider = customizedTestPlugin({
    name: "test-plugin",
    handlers: {
      cleanupEnvironment: async ({ ctx }) => {
        testEnvStatuses[ctx.environmentName] = { ready: false, outputs: {} }
        return {}
      },
      getEnvironmentStatus: async ({ ctx }) => {
        return testEnvStatuses[ctx.environmentName] || { ready: true, outputs: {} }
      },
    },
    createActionTypes: {
      Deploy: [
        {
          name: "test",
          docs: "Test Deploy action",
          schema: execDeployActionSchema(),
          handlers: {
            deploy: async () => {
              return { state: "ready", detail: { state: "ready", detail: {} }, outputs: {} }
            },
            getStatus: async () => {
              return { state: "ready", detail: { state: "ready", detail: {} }, outputs: {} }
            },
            delete: async (params) => {
              deletedServices.push(params.action.name)
              deleteOrder.push(params.action.name)
              return { state: "unknown", detail: { state: "unknown", detail: {} }, outputs: {} }
            },
          },
        },
      ],
    },
  })

  beforeEach(async () => {
    deletedServices = []
    deleteOrder = []
    garden = await makeTestGarden(projectRootB, { plugins })
    garden.setModuleConfigs(moduleConfigs)
    log = garden.log
  })

  const command = new DeleteEnvironmentCommand()
  const plugins = [testProvider]

  it("should delete environment with services", async () => {
    const { result } = await command.action({
      garden,
      log,
      footerLog: log,
      headerLog: log,
      args: {},
      opts: withDefaultGlobalOpts({ "dependants-first": false }),
    })

    expect(command.outputsSchema().validate(result).error).to.be.undefined

    expect(result!.providerStatuses["test-plugin"]["ready"]).to.be.false
    expect(result!.deployStatuses).to.eql({
      "service-a": { forwardablePorts: [], state: "missing", detail: {}, outputs: {} },
      "service-b": { forwardablePorts: [], state: "missing", detail: {}, outputs: {} },
      "service-c": { forwardablePorts: [], state: "missing", detail: {}, outputs: {} },
      "service-d": { forwardablePorts: [], state: "missing", detail: {}, outputs: {} },
    })
    expect(deletedServices.sort()).to.eql(["service-a", "service-b", "service-c", "service-d"])
  })

  context("when called with --dependants-first", () => {
    it("should delete environment with services in dependant order", async () => {
      const { result } = await command.action({
        garden,
        log,
        footerLog: log,
        headerLog: log,
        args: {},
        opts: withDefaultGlobalOpts({ "dependants-first": true }),
      })

      expect(command.outputsSchema().validate(result).error).to.be.undefined

      expect(result!.providerStatuses["test-plugin"]["ready"]).to.be.false
      expect(result!.deployStatuses).to.eql({
        "service-a": { forwardablePorts: [], state: "missing", detail: {}, outputs: {} },
        "service-b": { forwardablePorts: [], state: "missing", detail: {}, outputs: {} },
        "service-c": { forwardablePorts: [], state: "missing", detail: {}, outputs: {} },
        "service-d": { forwardablePorts: [], state: "missing", detail: {}, outputs: {} },
      })
      expect(deletedServices.sort()).to.eql(["service-a", "service-b", "service-c", "service-d"])

      // This means that the services were deleted in dependant order.
      expect(deleteOrder).to.eql(["service-d", "service-c", "service-b", "service-a"])
    })
  })

  it("should be protected", async () => {
    expect(command.protected).to.be.true
  })
})

describe("DeleteServiceCommand", () => {
  let deleteOrder: string[] = []

  const testStatuses: { [key: string]: ActionStatus } = {
    "service-a": {
      state: "unknown",
      detail: { state: "unknown", detail: {} },
      outputs: {},
    },
    "service-b": {
      state: "unknown",
      detail: { state: "unknown", detail: {} },
      outputs: {},
    },
    "service-c": {
      state: "unknown",
      detail: { state: "unknown", detail: {} },
      outputs: {},
    },
    "service-d": {
      state: "unknown",
      detail: { state: "unknown", detail: {} },
      outputs: {},
    },
  }

  const testProvider = customizedTestPlugin({
    name: "test-plugin",
    createActionTypes: {
      Deploy: [
        {
          name: "test",
          docs: "Test Deploy action",
          schema: execDeployActionSchema(),
          handlers: {
            deploy: async () => {
              return { state: "ready", detail: { state: "ready", detail: {} }, outputs: {} }
            },
            getStatus: async () => {
              return { state: "ready", detail: { state: "ready", detail: {} }, outputs: {} }
            },
            delete: async (params) => {
              deleteOrder.push(params.action.name)
              return testStatuses[params.action.name]
            },
          },
        },
      ],
    },
  })

  const plugins = [testProvider]

  const command = new DeleteDeployCommand()
  let garden: TestGarden
  let log: LogEntry

  beforeEach(async () => {
    deleteOrder = []
    garden = await makeTestGarden(projectRootB, { plugins })
    garden.setModuleConfigs(moduleConfigs)
    log = garden.log
  })

  it("should return the status of the deleted service", async () => {
    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { names: ["service-a"] },
      opts: withDefaultGlobalOpts({ "with-dependants": false, "dependants-first": false }),
    })

    expect(command.outputsSchema().validate(result).error).to.be.undefined

    expect(result).to.eql({
      "service-a": { forwardablePorts: [], state: "unknown", ingresses: [], detail: {}, outputs: {} },
    })
  })

  it("should delete the specified services and return their statuses", async () => {
    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { names: ["service-a", "service-b", "service-c"] },
      opts: withDefaultGlobalOpts({ "with-dependants": false, "dependants-first": false }),
    })

    expect(result).to.eql({
      "service-a": { forwardablePorts: [], state: "unknown", ingresses: [], detail: {}, outputs: {} },
      "service-b": { forwardablePorts: [], state: "unknown", ingresses: [], detail: {}, outputs: {} },
      "service-c": { forwardablePorts: [], state: "unknown", ingresses: [], detail: {}, outputs: {} },
    })
  })

  context("when called with --dependants-first", () => {
    it("should delete the specified services in reverse dependency order and return their statuses", async () => {
      const { result } = await command.action({
        garden,
        log,
        headerLog: log,
        footerLog: log,
        args: { names: ["service-a", "service-b", "service-c"] },
        opts: withDefaultGlobalOpts({ "with-dependants": false, "dependants-first": true }),
      })
      expect(deleteOrder).to.eql(["service-c", "service-b", "service-a"])
      expect(result).to.eql({
        "service-a": { forwardablePorts: [], state: "unknown", ingresses: [], detail: {}, outputs: {} },
        "service-b": { forwardablePorts: [], state: "unknown", ingresses: [], detail: {}, outputs: {} },
        "service-c": { forwardablePorts: [], state: "unknown", ingresses: [], detail: {}, outputs: {} },
      })
    })
  })

  context("when called with --with-dependants", () => {
    it("should delete the specified services and their dependants in reverse dependency order", async () => {
      const { result } = await command.action({
        garden,
        log,
        headerLog: log,
        footerLog: log,
        args: { names: ["service-a"] },
        opts: withDefaultGlobalOpts({ "with-dependants": true, "dependants-first": false }),
      })
      expect(deleteOrder).to.eql(["service-d", "service-c", "service-b", "service-a"])
      expect(result).to.eql({
        "service-a": { forwardablePorts: [], state: "unknown", ingresses: [], detail: {}, outputs: {} },
        "service-b": { forwardablePorts: [], state: "unknown", ingresses: [], detail: {}, outputs: {} },
        "service-c": { forwardablePorts: [], state: "unknown", ingresses: [], detail: {}, outputs: {} },
        "service-d": { forwardablePorts: [], state: "unknown", ingresses: [], detail: {}, outputs: {} },
      })
    })
  })

  it("should delete all services if none are specified", async () => {
    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { names: undefined },
      opts: withDefaultGlobalOpts({ "with-dependants": false, "dependants-first": true }),
    })
    expect(result).to.eql({
      "service-a": { forwardablePorts: [], state: "unknown", ingresses: [], detail: {}, outputs: {} },
      "service-b": { forwardablePorts: [], state: "unknown", ingresses: [], detail: {}, outputs: {} },
      "service-c": { forwardablePorts: [], state: "unknown", ingresses: [], detail: {}, outputs: {} },
      "service-d": { forwardablePorts: [], state: "unknown", ingresses: [], detail: {}, outputs: {} },
    })
  })

  it("should be protected", async () => {
    expect(command.protected).to.be.true
  })
})
