import { join } from "path"
import { GardenContext } from "../../src/context"
import { expect } from "chai"
import { makeTestContext, makeTestContextA, makeTestModule, projectRootA, testPluginA } from "../helpers"

describe("GardenContext", () => {
  it("should throw when initializing with missing plugins", async () => {
    try {
      await GardenContext.factory(projectRootA)
    } catch (err) {
      expect(err.type).to.equal("configuration")
      return
    }

    throw new Error("Expected error")
  })

  it("should initialize add the action handlers for a plugin", async () => {
    const ctx = await makeTestContextA()

    expect(ctx.plugins["test-plugin"]).to.be.ok
    expect(ctx.actionHandlers.configureEnvironment["test-plugin"]).to.be.ok
    expect(ctx.plugins["test-plugin-b"]).to.be.ok
    expect(ctx.actionHandlers.configureEnvironment["test-plugin-b"]).to.be.ok
  })

  it("should throw if registering same plugin twice", async () => {
    try {
      await GardenContext.factory(projectRootA, {
        plugins: [
          (_ctx) => testPluginA,
          (_ctx) => testPluginA,
        ],
      })
    } catch (err) {
      expect(err.type).to.equal("configuration")
      return
    }

    throw new Error("Expected error")
  })

  it("should parse the config from the project root", async () => {
    const ctx = await makeTestContextA()
    const config = ctx.projectConfig

    expect(config).to.eql({
      defaultEnvironment: "local",
      environments: {
        local: {
          providers: {
            test: {
              type: "test-plugin",
            },
            "test-b": {
              type: "test-plugin-b",
            },
          },
        },
        other: {},
      },
      name: "build-test-project",
      version: "0",
      variables: {
        some: "variable",
      },
    })
  })

  it("should expand templated env variables in project config", async () => {
    process.env.TEST_PROVIDER_TYPE = "test-plugin"
    process.env.TEST_VARIABLE = "banana"

    const ctx = await makeTestContext(join(__dirname, "..", "data", "test-project-templated"))
    const config = ctx.projectConfig

    delete process.env.TEST_PROVIDER_TYPE
    delete process.env.TEST_VARIABLE

    expect(config).to.eql({
      defaultEnvironment: "local",
      environments: {
        local: {
          providers: {
            test: {
              type: "test-plugin",
            },
          },
        },
      },
      name: "test-project-templated",
      version: "0",
      variables: {
        some: "banana",
        "service-a-build-command": "echo OK",
      },
    })
  })

  describe("setEnvironment", () => {
    it("should set the active environment for the context", async () => {
      const ctx = await makeTestContextA()

      const { name, namespace } = ctx.setEnvironment("local")
      expect(name).to.equal("local")
      expect(namespace).to.equal("default")

      const env = ctx.getEnvironment()
      expect(env.name).to.equal("local")
      expect(env.namespace).to.equal("default")
    })

    it("should optionally set a namespace with the dot separator", async () => {
      const ctx = await makeTestContextA()

      const { name, namespace } = ctx.setEnvironment("local.mynamespace")
      expect(name).to.equal("local")
      expect(namespace).to.equal("mynamespace")
    })

    it("should split environment and namespace on the first dot", async () => {
      const ctx = await makeTestContextA()

      const { name, namespace } = ctx.setEnvironment("local.mynamespace.2")
      expect(name).to.equal("local")
      expect(namespace).to.equal("mynamespace.2")
    })

    it("should throw if the specified environment isn't configured", async () => {
      const ctx = await makeTestContextA()

      try {
        ctx.setEnvironment("bla")
      } catch (err) {
        expect(err.type).to.equal("parameter")
        return
      }

      throw new Error("Expected error")
    })

    it("should throw if namespace starts with 'garden-'", async () => {
      const ctx = await makeTestContextA()

      try {
        ctx.setEnvironment("local.garden-bla")
      } catch (err) {
        expect(err.type).to.equal("parameter")
        return
      }

      throw new Error("Expected error")
    })
  })

  describe("getEnvironment", () => {
    it("should get the active environment for the context", async () => {
      const ctx = await makeTestContextA()

      const { name, namespace } = ctx.setEnvironment("other")
      expect(name).to.equal("other")
      expect(namespace).to.equal("default")

      const env = ctx.getEnvironment()
      expect(env.name).to.equal("other")
      expect(env.namespace).to.equal("default")
    })

    it("should return default environment if none has been explicitly set", async () => {
      const ctx = await makeTestContextA()

      const { name, namespace } = ctx.getEnvironment()
      expect(name).to.equal("local")
      expect(namespace).to.equal("default")
    })
  })

  describe("getModules", () => {
    it("should scan and return all registered modules in the context", async () => {
      const ctx = await makeTestContextA()
      const modules = await ctx.getModules()

      expect(Object.keys(modules)).to.eql(["module-a", "module-b", "module-c"])
    })

    it("should optionally return specified modules in the context", async () => {
      const ctx = await makeTestContextA()
      const modules = await ctx.getModules(["module-b", "module-c"])

      expect(Object.keys(modules)).to.eql(["module-b", "module-c"])
    })

    it("should throw if named module is missing", async () => {
      const ctx = await makeTestContextA()

      try {
        await ctx.getModules(["bla"])
      } catch (err) {
        expect(err.type).to.equal("parameter")
        return
      }

      throw new Error("Expected error")
    })
  })

  describe("getServices", () => {
    it("should scan for modules and return all registered services in the context", async () => {
      const ctx = await makeTestContextA()
      const services = await ctx.getServices()

      expect(Object.keys(services)).to.eql(["service-a", "service-b", "service-c"])
    })

    it("should optionally return specified services in the context", async () => {
      const ctx = await makeTestContextA()
      const services = await ctx.getServices(["service-b", "service-c"])

      expect(Object.keys(services)).to.eql(["service-b", "service-c"])
    })

    it("should throw if named service is missing", async () => {
      const ctx = await makeTestContextA()

      try {
        await ctx.getServices(["bla"])
      } catch (err) {
        expect(err.type).to.equal("parameter")
        return
      }

      throw new Error("Expected error")
    })
  })

  describe("getService", () => {
    it("should return the specified service", async () => {
      const ctx = await makeTestContextA()
      const service = await ctx.getService("service-b")

      expect(service.name).to.equal("service-b")
    })

    it("should throw if service is missing", async () => {
      const ctx = await makeTestContextA()

      try {
        await ctx.getServices(["bla"])
      } catch (err) {
        expect(err.type).to.equal("parameter")
        return
      }

      throw new Error("Expected error")
    })
  })

  describe("scanModules", () => {
    // TODO: assert that gitignore in project root is respected

    it("should scan the project root for modules and add to the context", async () => {
      const ctx = await makeTestContextA()
      await ctx.scanModules()

      const modules = await ctx.getModules(undefined, true)
      expect(Object.keys(modules)).to.eql(["module-a", "module-b", "module-c"])
    })
  })

  describe("addModule", () => {
    it("should add the given module and its services to the context", async () => {
      const ctx = await makeTestContextA()

      const testModule = makeTestModule(ctx)
      await ctx.addModule(testModule)

      const modules = await ctx.getModules(undefined, true)
      expect(Object.keys(modules)).to.eql(["test"])

      const services = await ctx.getServices(undefined, true)
      expect(Object.keys(services)).to.eql(["testService"])
    })

    it("should throw when adding module twice without force parameter", async () => {
      const ctx = await makeTestContextA()

      const testModule = makeTestModule(ctx)
      await ctx.addModule(testModule)

      try {
        await ctx.addModule(testModule)
      } catch (err) {
        expect(err.type).to.equal("configuration")
        return
      }

      throw new Error("Expected error")
    })

    it("should allow adding module multiple times with force parameter", async () => {
      const ctx = await makeTestContextA()

      const testModule = makeTestModule(ctx)
      await ctx.addModule(testModule)
      await ctx.addModule(testModule, true)

      const modules = await ctx.getModules(undefined, true)
      expect(Object.keys(modules)).to.eql(["test"])
    })

    it("should throw if a service is added twice without force parameter", async () => {
      const ctx = await makeTestContextA()

      const testModule = makeTestModule(ctx)
      const testModuleB = makeTestModule(ctx, "test-b")
      await ctx.addModule(testModule)

      try {
        await ctx.addModule(testModuleB)
      } catch (err) {
        expect(err.type).to.equal("configuration")
        return
      }

      throw new Error("Expected error")
    })

    it("should allow adding service multiple times with force parameter", async () => {
      const ctx = await makeTestContextA()

      const testModule = makeTestModule(ctx)
      const testModuleB = makeTestModule(ctx, "test-b")
      await ctx.addModule(testModule)
      await ctx.addModule(testModuleB, true)

      const services = await ctx.getServices(undefined, true)
      expect(Object.keys(services)).to.eql(["testService"])
    })
  })

  describe("resolveModule", () => {
    it("should return named module", async () => {
      const ctx = await makeTestContextA()
      await ctx.scanModules()

      const module = await ctx.resolveModule("module-a")
      expect(module.name).to.equal("module-a")
    })

    it("should throw if named module is requested and not available", async () => {
      const ctx = await makeTestContextA()

      try {
        await ctx.resolveModule("module-a")
      } catch (err) {
        expect(err.type).to.equal("configuration")
        return
      }

      throw new Error("Expected error")
    })

    it("should resolve module by absolute path", async () => {
      const ctx = await makeTestContextA()
      const path = join(projectRootA, "module-a")

      const module = await ctx.resolveModule(path)
      expect(module.name).to.equal("module-a")
    })

    it("should resolve module by relative path to project root", async () => {
      const ctx = await makeTestContextA()

      const module = await ctx.resolveModule("./module-a")
      expect(module.name).to.equal("module-a")
    })
  })

  describe("getTemplateContext", () => {
    it("should return the basic project context without parameters", async () => {
      const ctx = await makeTestContextA()

      const result = await ctx.getTemplateContext()

      expect(Object.keys(result).length).to.equal(3)
      expect(result.variables).to.eql({ some: "variable" })
      expect(result.local).to.eql({ env: process.env })
      expect(result.environment).to.eql({
        name: "local",
        config: {
          providers: {
            test: { type: "test-plugin" },
            "test-b": { type: "test-plugin-b" },
          },
        },
      })
    })

    it("should extend the basic project context if specified", async () => {
      const ctx = await makeTestContextA()

      const result = await ctx.getTemplateContext({ my: "things" })

      expect(Object.keys(result).length).to.equal(4)
      expect(result.variables).to.eql({ some: "variable" })
      expect(result.local).to.eql({ env: process.env })
      expect(result.environment).to.eql({
        name: "local",
        config: {
          providers: {
            test: { type: "test-plugin" },
            "test-b": { type: "test-plugin-b" },
          },
        },
      })
      expect(result.my).to.eql("things")
    })
  })

  describe("getActionHandlers", () => {
    it("should return all handlers for a type", async () => {
      const ctx = await makeTestContextA()

      const handlers = ctx.getActionHandlers("parseModule")

      expect(Object.keys(handlers)).to.eql([
        "generic",
        "test-plugin-b",
      ])
    })

    it("should optionally limit to handlers for specific module type", async () => {
      const ctx = await makeTestContextA()

      const handlers = ctx.getActionHandlers("parseModule", "generic")

      expect(Object.keys(handlers)).to.eql([
        "generic",
      ])
    })
  })

  describe("getActionHandler", () => {
    it("should return last configured handler for specified action type", async () => {
      const ctx = await makeTestContextA()

      const handler = ctx.getActionHandler("parseModule")

      expect(handler["actionType"]).to.equal("parseModule")
      expect(handler["pluginName"]).to.equal("test-plugin-b")
    })

    it("should optionally filter to only handlers for the specified module type", async () => {
      const ctx = await makeTestContextA()

      const handler = ctx.getActionHandler("parseModule", "test")

      expect(handler["actionType"]).to.equal("parseModule")
      expect(handler["pluginName"]).to.equal("test-plugin-b")
    })

    it("should throw if no handler is available", async () => {
      const ctx = await makeTestContextA()

      try {
        ctx.getActionHandler("deployService", "container")
      } catch (err) {
        expect(err.type).to.equal("parameter")
        return
      }

      throw new Error("Expected error")
    })
  })

  describe("getEnvActionHandlers", () => {
    it("should return all handlers for a type that are configured for the set environment", async () => {
      const ctx = await makeTestContextA()
      ctx.setEnvironment("local")

      const handlers = ctx.getEnvActionHandlers("configureEnvironment")
      expect(Object.keys(handlers)).to.eql(["test-plugin", "test-plugin-b"])
    })

    it("should optionally limit to handlers that support a specific module type", async () => {
      const ctx = await makeTestContextA()
      ctx.setEnvironment("local")

      const handlers = ctx.getEnvActionHandlers("configureEnvironment", "test")
      expect(Object.keys(handlers)).to.eql(["test-plugin-b"])
    })

    it("should throw if environment has not been set", async () => {
      const ctx = await makeTestContextA()

      try {
        ctx.getEnvActionHandlers("configureEnvironment", "container")
      } catch (err) {
        expect(err.type).to.equal("plugin")
      }
    })
  })

  describe("getEnvActionHandler", () => {
    it("should return last configured handler for specified action type", async () => {
      const ctx = await makeTestContextA()
      ctx.setEnvironment("local")

      const handler = ctx.getEnvActionHandler("configureEnvironment")

      expect(handler["actionType"]).to.equal("configureEnvironment")
      expect(handler["pluginName"]).to.equal("test-plugin-b")
    })

    it("should optionally filter to only handlers for the specified module type", async () => {
      const ctx = await makeTestContextA()
      ctx.setEnvironment("local")

      const handler = ctx.getEnvActionHandler("deployService", "test")

      expect(handler["actionType"]).to.equal("deployService")
      expect(handler["pluginName"]).to.equal("test-plugin-b")
    })

    it("should throw if no handler is available", async () => {
      const ctx = await makeTestContextA()
      ctx.setEnvironment("local")

      try {
        ctx.getEnvActionHandler("deployService", "container")
      } catch (err) {
        expect(err.type).to.equal("parameter")
        return
      }

      throw new Error("Expected error")
    })
  })
})
