import * as Joi from "joi"

import {
  ModuleAndRuntimeActions,
  PluginActions,
  PluginFactory,
  moduleActionDescriptions,
  pluginActionDescriptions,
} from "../../../src/types/plugin/plugin"
import { RuntimeContext, Service, getServiceRuntimeContext } from "../../../src/types/service"
import { expectError, makeTestGardenA } from "../../helpers"

import { ActionHelper } from "../../../src/actions"
import { Garden } from "../../../src/garden"
import { LogEntry } from "../../../src/logger/log-entry"
import { Module } from "../../../src/types/module"
import { ServiceLogEntry } from "../../../src/types/plugin/service/getServiceLogs"
import Stream from "ts-stream"
import { Task } from "../../../src/types/task"
import { expect } from "chai"
import { omit } from "lodash"
import { validate } from "../../../src/config/common"

const now = new Date()

describe("ActionHelper", () => {
  let garden: Garden
  let log: LogEntry
  let actions: ActionHelper
  let module: Module
  let service: Service
  let runtimeContext: RuntimeContext
  let task: Task

  before(async () => {
    const plugins = { "test-plugin": testPlugin, "test-plugin-b": testPluginB }
    garden = await makeTestGardenA(plugins)
    log = garden.log
    actions = await garden.getActionHelper()
    const graph = await garden.getConfigGraph()
    module = await graph.getModule("module-a")
    service = await graph.getService("service-a")
    runtimeContext = await getServiceRuntimeContext(garden, graph, service)
    task = await graph.getTask("task-a")
  })

  // Note: The test plugins below implicitly validate input params for each of the tests
  describe("environment actions", () => {
    describe("getEnvironmentStatus", () => {
      it("should return a map of statuses for providers that have a getEnvironmentStatus handler", async () => {
        const result = await actions.getEnvironmentStatus({ log })
        expect(result).to.eql({
          "test-plugin": { ready: false, dashboardPages: [] },
          "test-plugin-b": { ready: false, dashboardPages: [] },
        })
      })

      it("should optionally filter to single plugin", async () => {
        const result = await actions.getEnvironmentStatus({ log, pluginName: "test-plugin" })
        expect(result).to.eql({
          "test-plugin": { ready: false, dashboardPages: [] },
        })
      })
    })

    describe("prepareEnvironment", () => {
      it("should prepare the environment for each configured provider", async () => {
        const result = await actions.prepareEnvironment({ log })
        expect(result).to.eql({
          "test-plugin": true,
          "test-plugin-b": true,
        })
      })

      it("should optionally filter to single plugin", async () => {
        const result = await actions.prepareEnvironment({ log, pluginName: "test-plugin" })
        expect(result).to.eql({
          "test-plugin": true,
        })
      })
    })

    describe("cleanupEnvironment", () => {
      it("should clean up environment for each configured provider", async () => {
        const result = await actions.cleanupEnvironment({ log })
        expect(result).to.eql({
          "test-plugin": { ready: false, dashboardPages: [] },
          "test-plugin-b": { ready: false, dashboardPages: [] },
        })
      })

      it("should optionally filter to single plugin", async () => {
        const result = await actions.cleanupEnvironment({ log, pluginName: "test-plugin" })
        expect(result).to.eql({
          "test-plugin": { ready: false, dashboardPages: [] },
        })
      })
    })

    describe("getSecret", () => {
      it("should retrieve a secret from the specified provider", async () => {
        const result = await actions.getSecret({ log, pluginName: "test-plugin", key: "foo" })
        expect(result).to.eql({ value: "foo" })
      })
    })

    describe("setSecret", () => {
      it("should set a secret via the specified provider", async () => {
        const result = await actions.setSecret({ log, pluginName: "test-plugin", key: "foo", value: "boo" })
        expect(result).to.eql({})
      })
    })

    describe("deleteSecret", () => {
      it("should delete a secret from the specified provider", async () => {
        const result = await actions.deleteSecret({ log, pluginName: "test-plugin", key: "foo" })
        expect(result).to.eql({ found: true })
      })
    })
  })

  describe("module actions", () => {
    describe("getBuildStatus", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.getBuildStatus({ log, module })
        expect(result).to.eql({
          ready: true,
        })
      })
    })

    describe("build", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.build({ log, module })
        expect(result).to.eql({})
      })
    })

    describe("hotReloadService", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.hotReloadService({
          log,
          service,
          runtimeContext: {
            envVars: { FOO: "bar" },
            dependencies: {},
          },
        })
        expect(result).to.eql({})
      })
    })

    describe("runModule", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const command = ["npm", "run"]
        const result = await actions.runModule({
          log,
          module,
          command,
          interactive: true,
          runtimeContext: {
            envVars: { FOO: "bar" },
            dependencies: {},
          },
        })
        expect(result).to.eql({
          moduleName: module.name,
          command,
          completedAt: now,
          output: "bla bla",
          success: true,
          startedAt: now,
          version: module.version,
        })
      })
    })

    describe("testModule", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.testModule({
          log,
          module,
          interactive: true,
          runtimeContext: {
            envVars: { FOO: "bar" },
            dependencies: {},
          },
          silent: false,
          testConfig: {
            name: "test",
            dependencies: [],
            timeout: 1234,
            spec: {},
          },
          testVersion: module.version,
        })
        expect(result).to.eql({
          moduleName: module.name,
          command: [],
          completedAt: now,
          output: "bla bla",
          success: true,
          startedAt: now,
          testName: "test",
          version: module.version,
        })
      })
    })

    describe("getTestResult", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.getTestResult({
          log,
          module,
          testName: "test",
          testVersion: module.version,
        })
        expect(result).to.eql({
          moduleName: module.name,
          command: [],
          completedAt: now,
          output: "bla bla",
          success: true,
          startedAt: now,
          testName: "test",
          version: module.version,
        })
      })
    })
  })

  describe("service actions", () => {
    describe("getServiceStatus", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.getServiceStatus({ log, service, runtimeContext, hotReload: false })
        expect(result).to.eql({ state: "ready" })
      })
    })

    describe("deployService", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.deployService({ log, service, runtimeContext, force: true, hotReload: false })
        expect(result).to.eql({ state: "ready" })
      })
    })

    describe("deleteService", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.deleteService({ log, service, runtimeContext })
        expect(result).to.eql({ state: "ready" })
      })
    })

    describe("execInService", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.execInService({
          log,
          service,
          runtimeContext,
          command: ["foo"],
          interactive: false,
        })
        expect(result).to.eql({ code: 0, output: "bla bla" })
      })
    })

    describe("getServiceLogs", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const stream = new Stream<ServiceLogEntry>()
        const result = await actions.getServiceLogs({ log, service, runtimeContext, stream, follow: false, tail: -1 })
        expect(result).to.eql({})
      })
    })

    describe("runService", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.runService({
          log,
          service,
          interactive: true,
          runtimeContext: {
            envVars: { FOO: "bar" },
            dependencies: {},
          },
        })
        expect(result).to.eql({
          moduleName: service.module.name,
          command: ["foo"],
          completedAt: now,
          output: "bla bla",
          success: true,
          startedAt: now,
          version: service.module.version,
        })
      })
    })
  })

  describe("runTask", () => {
    it("should correctly call the corresponding plugin handler", async () => {
      const result = await actions.runTask({
        log,
        task,
        interactive: true,
        runtimeContext: {
          envVars: { FOO: "bar" },
          dependencies: {},
        },
        taskVersion: task.module.version,
      })
      expect(result).to.eql({
        moduleName: task.module.name,
        taskName: task.name,
        command: ["foo"],
        completedAt: now,
        output: "bla bla",
        success: true,
        startedAt: now,
        version: task.module.version,
      })
    })
  })

  describe("getActionHelpers", () => {
    it("should return all handlers for a type", async () => {
      const handlers = actions.getActionHelpers("prepareEnvironment")

      expect(Object.keys(handlers)).to.eql([
        "test-plugin",
        "test-plugin-b",
      ])
    })
  })

  describe("getModuleActionHandlers", () => {
    it("should return all handlers for a type", async () => {
      const handlers = actions.getModuleActionHandlers({ actionType: "build", moduleType: "exec" })

      expect(Object.keys(handlers)).to.eql([
        "exec",
      ])
    })
  })

  describe("getActionHelper", () => {
    it("should return last configured handler for specified action type", async () => {
      const gardenA = await makeTestGardenA()
      const actionsA = await gardenA.getActionHelper()
      const handler = actionsA.getActionHelper({ actionType: "prepareEnvironment" })

      expect(handler["actionType"]).to.equal("prepareEnvironment")
      expect(handler["pluginName"]).to.equal("test-plugin-b")
    })

    it("should optionally filter to only handlers for the specified module type", async () => {
      const gardenA = await makeTestGardenA()
      const actionsA = await gardenA.getActionHelper()
      const handler = actionsA.getActionHelper({ actionType: "prepareEnvironment" })

      expect(handler["actionType"]).to.equal("prepareEnvironment")
      expect(handler["pluginName"]).to.equal("test-plugin-b")
    })

    it("should throw if no handler is available", async () => {
      const gardenA = await makeTestGardenA()
      const actionsA = await gardenA.getActionHelper()
      await expectError(() => actionsA.getActionHelper({ actionType: "cleanupEnvironment" }), "parameter")
    })
  })

  describe("getModuleActionHandler", () => {
    it("should return last configured handler for specified module action type", async () => {
      const gardenA = await makeTestGardenA()
      const actionsA = await gardenA.getActionHelper()
      const handler = actionsA.getModuleActionHandler({ actionType: "deployService", moduleType: "test" })

      expect(handler["actionType"]).to.equal("deployService")
      expect(handler["pluginName"]).to.equal("test-plugin-b")
    })

    it("should throw if no handler is available", async () => {
      const gardenA = await makeTestGardenA()
      const actionsA = await gardenA.getActionHelper()
      await expectError(
        () => actionsA.getModuleActionHandler({ actionType: "execInService", moduleType: "container" }),
        "parameter",
      )
    })
  })
})

const testPlugin: PluginFactory = async () => ({
  actions: <PluginActions>{
    getEnvironmentStatus: async (params) => {
      validate(params, pluginActionDescriptions.getEnvironmentStatus.paramsSchema)
      return {
        ready: false,
      }
    },

    prepareEnvironment: async (params) => {
      validate(params, pluginActionDescriptions.prepareEnvironment.paramsSchema)
      return {}
    },

    cleanupEnvironment: async (params) => {
      validate(params, pluginActionDescriptions.cleanupEnvironment.paramsSchema)
      return {}
    },

    getSecret: async (params) => {
      validate(params, pluginActionDescriptions.getSecret.paramsSchema)
      return { value: params.key }
    },

    setSecret: async (params) => {
      validate(params, pluginActionDescriptions.setSecret.paramsSchema)
      return {}
    },

    deleteSecret: async (params) => {
      validate(params, pluginActionDescriptions.deleteSecret.paramsSchema)
      return { found: true }
    },
  },
  moduleActions: {
    test: <ModuleAndRuntimeActions>{
      describeType: async (params) => {
        validate(params, moduleActionDescriptions.describeType.paramsSchema)
        return {
          docs: "bla bla bla",
          schema: Joi.object(),
          title: "Bla",
        }
      },

      configure: async (params) => {
        validate(params, moduleActionDescriptions.configure.paramsSchema)

        const serviceConfigs = params.moduleConfig.spec.services.map(spec => ({
          name: spec.name,
          dependencies: spec.dependencies || [],
          hotReloadable: false,
          spec,
        }))

        const taskConfigs = (params.moduleConfig.spec.tasks || []).map(spec => ({
          name: spec.name,
          dependencies: spec.dependencies || [],
          spec,
        }))

        return {
          ...params.moduleConfig,
          serviceConfigs,
          taskConfigs,
        }
      },

      getBuildStatus: async (params) => {
        validate(params, moduleActionDescriptions.getBuildStatus.paramsSchema)
        return { ready: true }
      },

      build: async (params) => {
        validate(params, moduleActionDescriptions.build.paramsSchema)
        return {}
      },

      publishModule: async (params) => {
        validate(params, moduleActionDescriptions.publishModule.paramsSchema)
        return { published: true }
      },

      hotReloadService: async (params) => {
        validate(params, moduleActionDescriptions.hotReloadService.paramsSchema)
        return {}
      },

      runModule: async (params) => {
        validate(params, moduleActionDescriptions.runModule.paramsSchema)
        return {
          moduleName: params.module.name,
          command: params.command,
          completedAt: now,
          output: "bla bla",
          success: true,
          startedAt: now,
          version: params.module.version,
        }
      },

      testModule: async (params) => {
        validate(params, moduleActionDescriptions.testModule.paramsSchema)
        return {
          moduleName: params.module.name,
          command: [],
          completedAt: now,
          output: "bla bla",
          success: true,
          startedAt: now,
          testName: params.testConfig.name,
          version: params.module.version,
        }
      },

      getTestResult: async (params) => {
        validate(params, moduleActionDescriptions.getTestResult.paramsSchema)
        return {
          moduleName: params.module.name,
          command: [],
          completedAt: now,
          output: "bla bla",
          success: true,
          startedAt: now,
          testName: params.testName,
          version: params.module.version,
        }
      },

      getServiceStatus: async (params) => {
        validate(params, moduleActionDescriptions.getServiceStatus.paramsSchema)
        return { state: "ready" }
      },

      deployService: async (params) => {
        validate(params, moduleActionDescriptions.deployService.paramsSchema)
        return { state: "ready" }
      },

      deleteService: async (params) => {
        validate(params, moduleActionDescriptions.deleteService.paramsSchema)
        return { state: "ready" }
      },

      execInService: async (params) => {
        validate(params, moduleActionDescriptions.execInService.paramsSchema)
        return {
          code: 0,
          output: "bla bla",
        }
      },

      getServiceLogs: async (params) => {
        validate(params, moduleActionDescriptions.getServiceLogs.paramsSchema)
        return {}
      },

      runService: async (params) => {
        validate(params, moduleActionDescriptions.runService.paramsSchema)
        return {
          moduleName: params.module.name,
          command: ["foo"],
          completedAt: now,
          output: "bla bla",
          success: true,
          startedAt: now,
          version: params.module.version,
        }
      },

      getTaskResult: async (params) => {
        validate(params, moduleActionDescriptions.getTaskResult.paramsSchema)
        const module = params.task.module
        return {
          moduleName: module.name,
          taskName: params.task.name,
          command: ["foo"],
          completedAt: now,
          output: "bla bla",
          success: true,
          startedAt: now,
          version: params.module.version,
        }
      },

      runTask: async (params) => {
        validate(params, moduleActionDescriptions.runTask.paramsSchema)
        const module = params.task.module
        return {
          moduleName: module.name,
          taskName: params.task.name,
          command: ["foo"],
          completedAt: now,
          output: "bla bla",
          success: true,
          startedAt: now,
          version: params.module.version,
        }
      },
    },
  },
})

const testPluginB: PluginFactory = async (params) => omit(await testPlugin(params), ["moduleActions"])
