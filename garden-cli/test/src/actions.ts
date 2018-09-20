import { Garden } from "../../src/garden"
import { makeTestGardenA } from "../helpers"
import { PluginFactory, PluginActions, ModuleAndServiceActions } from "../../src/types/plugin/plugin"
import { validate } from "../../src/config/common"
import { ActionHelper } from "../../src/actions"
import { expect } from "chai"
import { omit } from "lodash"
import { Module } from "../../src/types/module"
import { Service } from "../../src/types/service"
import Stream from "ts-stream"
import { ServiceLogEntry } from "../../src/types/plugin/outputs"
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
  getServiceOutputsParamsSchema,
  execInServiceParamsSchema,
  getServiceLogsParamsSchema,
  runServiceParamsSchema,
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
  let actions: ActionHelper
  let module: Module
  let service: Service

  before(async () => {
    garden = await makeTestGardenA([testPlugin, testPluginB])
    actions = garden.actions
    module = await garden.getModule("module-a")
    service = await garden.getService("service-a")
  })

  // Note: The test plugins below implicitly validate input params for each of the tests
  describe("environment actions", () => {
    describe("getEnvironmentStatus", () => {
      it("should return a map of statuses for providers that have a getEnvironmentStatus handler", async () => {
        const result = await actions.getEnvironmentStatus({})
        expect(result).to.eql({
          "test-plugin": { ready: false },
          "test-plugin-b": { ready: false },
        })
      })

      it("should optionally filter to single plugin", async () => {
        const result = await actions.getEnvironmentStatus({ pluginName: "test-plugin" })
        expect(result).to.eql({
          "test-plugin": { ready: false },
        })
      })
    })

    describe("prepareEnvironment", () => {
      it("should prepare the environment for each configured provider", async () => {
        const result = await actions.prepareEnvironment({})
        expect(result).to.eql({
          "test-plugin": true,
          "test-plugin-b": true,
        })
      })

      it("should optionally filter to single plugin", async () => {
        const result = await actions.prepareEnvironment({ pluginName: "test-plugin" })
        expect(result).to.eql({
          "test-plugin": true,
        })
      })
    })

    describe("cleanupEnvironment", () => {
      it("should clean up environment for each configured provider", async () => {
        const result = await actions.cleanupEnvironment({})
        expect(result).to.eql({
          "test-plugin": { ready: false },
          "test-plugin-b": { ready: false },
        })
      })

      it("should optionally filter to single plugin", async () => {
        const result = await actions.cleanupEnvironment({ pluginName: "test-plugin" })
        expect(result).to.eql({
          "test-plugin": { ready: false },
        })
      })
    })

    describe("getSecret", () => {
      it("should retrieve a secret from the specified provider", async () => {
        const result = await actions.getSecret({ pluginName: "test-plugin", key: "foo" })
        expect(result).to.eql({ value: "foo" })
      })
    })

    describe("setSecret", () => {
      it("should set a secret via the specified provider", async () => {
        const result = await actions.setSecret({ pluginName: "test-plugin", key: "foo", value: "boo" })
        expect(result).to.eql({})
      })
    })

    describe("deleteSecret", () => {
      it("should delete a secret from the specified provider", async () => {
        const result = await actions.deleteSecret({ pluginName: "test-plugin", key: "foo" })
        expect(result).to.eql({ found: true })
      })
    })
  })

  describe("module actions", () => {
    describe("getBuildStatus", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.getBuildStatus({ module })
        expect(result).to.eql({
          ready: true,
        })
      })
    })

    describe("build", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.build({ module })
        expect(result).to.eql({})
      })
    })

    describe("pushModule", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.pushModule({ module })
        expect(result).to.eql({
          pushed: true,
        })
      })
    })

    describe("runModule", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const command = ["npm", "run"]
        const result = await actions.runModule({
          module,
          command,
          interactive: true,
          runtimeContext: {
            envVars: { FOO: "bar" },
            dependencies: {},
          },
          silent: false,
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
        const result = await actions.getServiceStatus({ service })
        expect(result).to.eql({ state: "ready" })
      })
    })

    describe("deployService", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.deployService({ service, force: true })
        expect(result).to.eql({ state: "ready" })
      })
    })

    describe("deleteService", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.deleteService({ service })
        expect(result).to.eql({ state: "ready" })
      })
    })

    describe("getServiceOutputs", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.getServiceOutputs({ service })
        expect(result).to.eql({ foo: "bar" })
      })
    })

    describe("execInService", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.execInService({ service, command: ["foo"] })
        expect(result).to.eql({ code: 0, output: "bla bla" })
      })
    })

    describe("getServiceLogs", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const stream = new Stream<ServiceLogEntry>()
        const result = await actions.getServiceLogs({ service, stream, tail: false })
        expect(result).to.eql({})
      })
    })

    describe("runService", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.runService({
          service,
          interactive: true,
          runtimeContext: {
            envVars: { FOO: "bar" },
            dependencies: {},
          },
          silent: false,
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
    test: <ModuleAndServiceActions>{
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

        return {
          ...params.moduleConfig,
          serviceConfigs,
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
    },
  },
})
testPlugin.pluginName = "test-plugin"

const testPluginB: PluginFactory = async (params) => omit(await testPlugin(params), ["moduleActions"])
testPluginB.pluginName = "test-plugin-b"
