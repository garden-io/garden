/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DeleteEnvironmentCommand, DeleteDeployCommand } from "../../../../src/commands/delete"
import {
  getDataDir,
  customizedTestPlugin,
  withDefaultGlobalOpts,
  makeTestGarden,
  makeModuleConfig,
  TestGarden,
} from "../../../helpers"
import { expect } from "chai"
import { EnvironmentStatus } from "../../../../src/plugin/handlers/provider/getEnvironmentStatus"
import { ModuleConfig } from "../../../../src/config/module"
import { LogEntry } from "../../../../src/logger/log-entry"
import { execDeployActionSchema } from "../../../../src/plugins/exec/config"
import { ActionStatus } from "../../../../src/actions/types"

const projectRootB = getDataDir("test-project-b")
const moduleConfigs: ModuleConfig[] = [
  makeModuleConfig(projectRootB, {
    name: "module-a",
    include: [],
    spec: {
      services: [{ name: "service-a", deployCommand: ["echo", "ok"] }],
      tests: [],
      tasks: [],
      build: { dependencies: [] },
    },
  }),
  makeModuleConfig(projectRootB, {
    name: "module-b",
    include: [],
    spec: {
      services: [{ name: "service-b", deployCommand: ["echo", "ok"], dependencies: ["service-a"] }],
      tests: [],
      tasks: [],
      build: { dependencies: [] },
    },
  }),
  makeModuleConfig(projectRootB, {
    name: "module-c",
    include: [],
    spec: {
      services: [{ name: "service-c", deployCommand: ["echo", "ok"], dependencies: ["service-b"] }],
      tests: [],
      tasks: [],
      build: { dependencies: [] },
    },
  }),
  makeModuleConfig(projectRootB, {
    name: "module-d",
    include: [],
    spec: {
      services: [{ name: "service-d", deployCommand: ["echo", "ok"], dependencies: ["service-c"] }],
      tests: [],
      tasks: [],
      build: { dependencies: [] },
    },
  }),
]

const missingDeployStatus: ActionStatus = {
  state: "not-ready",
  detail: { state: "missing", forwardablePorts: [], outputs: {}, detail: {} },
  outputs: {},
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
            deploy: async (_params) => {
              return { state: "ready", detail: { state: "ready", detail: {} }, outputs: {} }
            },
            getStatus: async (_params) => {
              return { state: "ready", detail: { state: "ready", detail: {} }, outputs: {} }
            },
            delete: async (params) => {
              deletedServices.push(params.action.name)
              deleteOrder.push(params.action.name)
              return { state: "not-ready", detail: { state: "missing", detail: {} }, outputs: {} }
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
    garden.setActionConfigs(moduleConfigs)
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
      "service-a": missingDeployStatus,
      "service-b": missingDeployStatus,
      "service-c": missingDeployStatus,
      "service-d": missingDeployStatus,
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
        "service-a": missingDeployStatus,
        "service-b": missingDeployStatus,
        "service-c": missingDeployStatus,
        "service-d": missingDeployStatus,
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

describe("DeleteDeployCommand", () => {
  let deleteOrder: string[] = []

  const testStatuses: { [key: string]: ActionStatus } = {
    "service-a": missingDeployStatus,
    "service-b": missingDeployStatus,
    "service-c": missingDeployStatus,
    "service-d": missingDeployStatus,
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
            deploy: async (_params) => {
              return { state: "ready", detail: { state: "ready", detail: {} }, outputs: {} }
            },
            getStatus: async (_params) => {
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
    garden.setActionConfigs(moduleConfigs)
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
      "service-a": missingDeployStatus,
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
      "service-a": missingDeployStatus,
      "service-b": missingDeployStatus,
      "service-c": missingDeployStatus,
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
        "service-a": missingDeployStatus,
        "service-b": missingDeployStatus,
        "service-c": missingDeployStatus,
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
        "service-a": missingDeployStatus,
        "service-b": missingDeployStatus,
        "service-c": missingDeployStatus,
        "service-d": missingDeployStatus,
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
      "service-a": missingDeployStatus,
      "service-b": missingDeployStatus,
      "service-c": missingDeployStatus,
      "service-d": missingDeployStatus,
    })
  })

  it("should be protected", async () => {
    expect(command.protected).to.be.true
  })
})
