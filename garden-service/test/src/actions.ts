import { Garden } from "../../src/garden"
import { makeTestGardenA } from "../helpers"
import { PluginFactory, PluginActions, ModuleAndRuntimeActions } from "../../src/types/plugin/plugin"
import { validate } from "../../src/config/common"
import { ActionHelper } from "../../src/actions"
import { expect } from "chai"
import { omit } from "lodash"
import { Module } from "../../src/types/module"
import { Service } from "../../src/types/service"
import { Task } from "../../src/types/task"
import Stream from "ts-stream"
import { ServiceLogEntry } from "../../src/types/plugin/outputs"
import { LogEntry } from "../../src/logger/log-entry"
import {
  describeModuleTypeParamsSchema,
  validateModuleParamsSchema,
  getBuildStatusParamsSchema,
  buildModuleParamsSchema,
  pushModuleParamsSchema,
  runModuleParamsSchema,
  testModuleParamsSchema,
  getTestResultParamsSchema,
  getServiceStatusParamsSchema,
  deployServiceParamsSchema,
  deleteServiceParamsSchema,
  hotReloadParamsSchema,
  getServiceOutputsParamsSchema,
  execInServiceParamsSchema,
  getServiceLogsParamsSchema,
  runServiceParamsSchema,
  getTaskStatusParamsSchema,
  runTaskParamsSchema,
  getEnvironmentStatusParamsSchema,
  prepareEnvironmentParamsSchema,
  cleanupEnvironmentParamsSchema,
  getSecretParamsSchema,
  setSecretParamsSchema,
  deleteSecretParamsSchema,
  publishModuleParamsSchema,
} from "../../src/types/plugin/params"

const now = new Date()

describe("ActionHelper", () => {
  let garden: Garden
  let log: LogEntry
  let actions: ActionHelper
  let module: Module
  let service: Service
  let task: Task

  before(async () => {
    const plugins = { "test-plugin": testPlugin, "test-plugin-b": testPluginB }
    garden = await makeTestGardenA(plugins)
    log = garden.log.info()
    actions = garden.actions
    module = await garden.getModule("module-a")
    service = await garden.getService("service-a")
    task = await garden.getTask("task-a")
  })

  // Note: The test plugins below implicitly validate input params for each of the tests
  describe("environment actions", () => {
    describe("getEnvironmentStatus", () => {
      it("should return a map of statuses for providers that have a getEnvironmentStatus handler", async () => {
        const result = await actions.getEnvironmentStatus({ log })
        expect(result).to.eql({
          "test-plugin": { ready: false },
          "test-plugin-b": { ready: false },
        })
      })

      it("should optionally filter to single plugin", async () => {
        const result = await actions.getEnvironmentStatus({ log, pluginName: "test-plugin" })
        expect(result).to.eql({
          "test-plugin": { ready: false },
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
          "test-plugin": { ready: false },
          "test-plugin-b": { ready: false },
        })
      })

      it("should optionally filter to single plugin", async () => {
        const result = await actions.cleanupEnvironment({ log, pluginName: "test-plugin" })
        expect(result).to.eql({
          "test-plugin": { ready: false },
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

    describe("pushModule", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.pushModule({ log, module })
        expect(result).to.eql({
          pushed: true,
        })
      })
    })

    describe("hotReload", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.hotReload({
          log,
          module,
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
          version: module.version,
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
        const result = await actions.getServiceStatus({ log, service })
        expect(result).to.eql({ state: "ready" })
      })
    })

    describe("deployService", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.deployService({ log, service, force: true })
        expect(result).to.eql({ state: "ready" })
      })
    })

    describe("deleteService", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.deleteService({ log, service })
        expect(result).to.eql({ state: "ready" })
      })
    })

    describe("getServiceOutputs", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.getServiceOutputs({ log, service })
        expect(result).to.eql({ foo: "bar" })
      })
    })

    describe("execInService", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.execInService({ log, service, command: ["foo"], interactive: false })
        expect(result).to.eql({ code: 0, output: "bla bla" })
      })
    })

    describe("getServiceLogs", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const stream = new Stream<ServiceLogEntry>()
        const result = await actions.getServiceLogs({ log, service, stream, tail: false })
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
        task,
        interactive: true,
        runtimeContext: {
          envVars: { FOO: "bar" },
          dependencies: {},
        },
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
})

const testPlugin: PluginFactory = async () => ({
  actions: <PluginActions>{
    getEnvironmentStatus: async (params) => {
      validate(params, getEnvironmentStatusParamsSchema)
      return {
        ready: false,
      }
    },

    prepareEnvironment: async (params) => {
      validate(params, prepareEnvironmentParamsSchema)
      return {}
    },

    cleanupEnvironment: async (params) => {
      validate(params, cleanupEnvironmentParamsSchema)
      return {}
    },

    getSecret: async (params) => {
      validate(params, getSecretParamsSchema)
      return { value: params.key }
    },

    setSecret: async (params) => {
      validate(params, setSecretParamsSchema)
      return {}
    },

    deleteSecret: async (params) => {
      validate(params, deleteSecretParamsSchema)
      return { found: true }
    },
  },
  moduleActions: {
    test: <ModuleAndRuntimeActions>{
      describeType: async (params) => {
        validate(params, describeModuleTypeParamsSchema)
        return {
          docs: "bla bla bla",
          schema: {},
        }
      },

      validate: async (params) => {
        validate(params, validateModuleParamsSchema)

        const serviceConfigs = params.moduleConfig.spec.services.map(spec => ({
          name: spec.name,
          dependencies: spec.dependencies || [],
          outputs: {},
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
        validate(params, getBuildStatusParamsSchema)
        return { ready: true }
      },

      build: async (params) => {
        validate(params, buildModuleParamsSchema)
        return {}
      },

      publishModule: async (params) => {
        validate(params, publishModuleParamsSchema)
        return { published: true }
      },

      pushModule: async (params) => {
        validate(params, pushModuleParamsSchema)
        return { pushed: true }
      },

      hotReload: async (params) => {
        validate(params, hotReloadParamsSchema)
        return {}
      },

      runModule: async (params) => {
        validate(params, runModuleParamsSchema)
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
        validate(params, testModuleParamsSchema)
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
        validate(params, getTestResultParamsSchema)
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
        validate(params, getServiceStatusParamsSchema)
        return { state: "ready" }
      },

      deployService: async (params) => {
        validate(params, deployServiceParamsSchema)
        return { state: "ready" }
      },

      deleteService: async (params) => {
        validate(params, deleteServiceParamsSchema)
        return { state: "ready" }
      },

      getServiceOutputs: async (params) => {
        validate(params, getServiceOutputsParamsSchema)
        return { foo: "bar" }
      },

      execInService: async (params) => {
        validate(params, execInServiceParamsSchema)
        return {
          code: 0,
          output: "bla bla",
        }
      },

      getServiceLogs: async (params) => {
        validate(params, getServiceLogsParamsSchema)
        return {}
      },

      runService: async (params) => {
        validate(params, runServiceParamsSchema)
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

      getTaskStatus: async (params) => {
        validate(params, getTaskStatusParamsSchema)
        return {
          done: true,
        }
      },

      runTask: async (params) => {
        validate(params, runTaskParamsSchema)
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
