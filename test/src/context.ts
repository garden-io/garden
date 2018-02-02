import { join } from "path"
import { GardenContext } from "../../src/context"
import { expect } from "chai"
import { PluginInterface, Plugin, PluginFactory } from "../../src/types/plugin"
import { Module } from "../../src/types/module"
import { ContainerModule } from "../../src/plugins/container"
import { defaultPlugins } from "../../src/plugins"

const projectRootA = join(__dirname, "..", "data", "test-project-a")

class TestModule extends Module {
  type = "test"
}

class TestPluginB extends Plugin {
  name = "test-plugin-b"
  supportedModuleTypes = ["container"]

  async parseModule() {
    return new ContainerModule(this.context, {
      version: "0",
      type: "test",
      name: "test",
      path: "bla",
      variables: {},
      build: { dependencies: [] },
      services: {
        testService: { daemon: false, dependencies: [], endpoints: [], ports: [], volumes: [] },
      },
    })
  }
  async configureEnvironment() { }
  async deployService() { return {} }
}

const testPlugin: PluginInterface<Module> = {
  name: "test-plugin",
  supportedModuleTypes: ["generic"],

  configureEnvironment: async () => { },
}

const makeTestModule = (ctx, name = "test") => {
  return new TestModule(ctx, {
    version: "0",
    type: "test",
    name,
    path: "bla",
    variables: {},
    build: { dependencies: [] },
    services: {
      testService: {},
    },
  })
}

export const makeTestContextA = (extraPlugins: PluginFactory[] = []) => {
  const testPlugins = [
    (_ctx) => testPlugin,
    (ctx) => new TestPluginB(ctx),
  ]
  const plugins: PluginFactory[] = defaultPlugins.concat(testPlugins).concat(extraPlugins)

  return new GardenContext(projectRootA, { plugins })
}

describe("GardenContext", () => {
  it("should initialize with the config from a project root", () => {
    const ctx = makeTestContextA()

    expect(ctx.config).to.eql({
      environments: {
        local: {
          providers: {
            generic: {
              type: "generic",
            },
            containers: {
              type: "kubernetes",
              context: "docker-for-desktop",
            },
          },
        },
        test: {
          providers: {
            test: {
              type: "test-plugin",
            },
            "test-b": {
              type: "test-plugin-b",
            },
          },
        },
      },
      name: "build-test-project",
      version: "0",
      variables: {},
    })
  })

  it("should throw when initializing with missing plugins", () => {
    try {
      new GardenContext(projectRootA)
    } catch (err) {
      expect(err.type).to.equal("configuration")
      return
    }

    throw new Error("Expected error")
  })

  it("should initialize add the action handlers for a plugin", () => {
    const ctx = makeTestContextA()

    expect(ctx.plugins["test-plugin"]).to.be.ok
    expect(ctx.actionHandlers.configureEnvironment["test-plugin"]).to.be.ok
    expect(ctx.plugins["test-plugin-b"]).to.be.ok
    expect(ctx.actionHandlers.configureEnvironment["test-plugin-b"]).to.be.ok
  })

  it("should throw if registering same plugin twice", () => {
    try {
      new GardenContext(projectRootA, {
        plugins: [
          (_ctx) => testPlugin,
          (_ctx) => testPlugin,
        ],
      })
    } catch (err) {
      expect(err.type).to.equal("configuration")
      return
    }

    throw new Error("Expected error")
  })

  describe("setEnvironment", () => {
    it("should set the active environment for the context", () => {
      const ctx = makeTestContextA()

      const { name, namespace } = ctx.setEnvironment("test")
      expect(name).to.equal("test")
      expect(namespace).to.equal("default")

      const env = ctx.getEnvironment()
      expect(env.name).to.equal("test")
      expect(env.namespace).to.equal("default")
    })

    it("should optionally set a namespace with the dot separator", () => {
      const ctx = makeTestContextA()

      const { name, namespace } = ctx.setEnvironment("test.mynamespace")
      expect(name).to.equal("test")
      expect(namespace).to.equal("mynamespace")
    })

    it("should split environment and namespace on the first dot", () => {
      const ctx = makeTestContextA()

      const { name, namespace } = ctx.setEnvironment("test.mynamespace.2")
      expect(name).to.equal("test")
      expect(namespace).to.equal("mynamespace.2")
    })

    it("should throw if the specified environment isn't configured", () => {
      const ctx = makeTestContextA()

      try {
        ctx.setEnvironment("bla")
      } catch (err) {
        expect(err.type).to.equal("parameter")
        return
      }

      throw new Error("Expected error")
    })

    it("should throw if namespace starts with 'garden-'", () => {
      const ctx = makeTestContextA()

      try {
        ctx.setEnvironment("test.garden-bla")
      } catch (err) {
        expect(err.type).to.equal("parameter")
        return
      }

      throw new Error("Expected error")
    })
  })

  describe("getEnvironment", () => {
    it("should get the active environment for the context", () => {
      const ctx = makeTestContextA()

      const { name, namespace } = ctx.setEnvironment("test")
      expect(name).to.equal("test")
      expect(namespace).to.equal("default")

      const env = ctx.getEnvironment()
      expect(env.name).to.equal("test")
      expect(env.namespace).to.equal("default")
    })

    it("should throw if an environment hasn't been set", () => {
      const ctx = makeTestContextA()

      try {
        ctx.getEnvironment()
      } catch (err) {
        expect(err.type).to.equal("plugin")
        return
      }

      throw new Error("Expected error")
    })
  })

  describe("getModules", () => {
    it("should scan and return all registered modules in the context", async () => {
      const ctx = makeTestContextA()
      const modules = await ctx.getModules()

      expect(Object.keys(modules)).to.eql(["module-a", "module-b", "module-c"])
    })

    it("should optionally return specified modules in the context", async () => {
      const ctx = makeTestContextA()
      const modules = await ctx.getModules(["module-b", "module-c"])

      expect(Object.keys(modules)).to.eql(["module-b", "module-c"])
    })

    it("should throw if named module is missing", async () => {
      const ctx = makeTestContextA()

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
      const ctx = makeTestContextA()
      const services = await ctx.getServices()

      expect(Object.keys(services)).to.eql(["service-a", "service-b", "service-c"])
    })

    it("should optionally return specified modules in the context", async () => {
      const ctx = makeTestContextA()
      const services = await ctx.getServices(["service-b", "service-c"])

      expect(Object.keys(services)).to.eql(["service-b", "service-c"])
    })

    it("should throw if named service is missing", async () => {
      const ctx = makeTestContextA()

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
      const ctx = makeTestContextA()
      await ctx.scanModules()

      const modules = await ctx.getModules(undefined, true)
      expect(Object.keys(modules)).to.eql(["module-a", "module-b", "module-c"])
    })
  })

  describe("addModule", () => {
    it("should add the given module and its services to the context", async () => {
      const ctx = makeTestContextA()

      const testModule = makeTestModule(ctx)
      ctx.addModule(testModule)

      const modules = await ctx.getModules(undefined, true)
      expect(Object.keys(modules)).to.eql(["test"])

      const services = await ctx.getServices(undefined, true)
      expect(Object.keys(services)).to.eql(["testService"])
    })

    it("should throw when adding module twice without force parameter", async () => {
      const ctx = makeTestContextA()

      const testModule = makeTestModule(ctx)
      ctx.addModule(testModule)

      try {
        ctx.addModule(testModule)
      } catch (err) {
        expect(err.type).to.equal("configuration")
        return
      }

      throw new Error("Expected error")
    })

    it("should allow adding module multiple times with force parameter", async () => {
      const ctx = makeTestContextA()

      const testModule = makeTestModule(ctx)
      ctx.addModule(testModule)
      ctx.addModule(testModule, true)

      const modules = await ctx.getModules(undefined, true)
      expect(Object.keys(modules)).to.eql(["test"])
    })

    it("should throw if a service is added twice without force parameter", () => {
      const ctx = makeTestContextA()

      const testModule = makeTestModule(ctx)
      const testModuleB = makeTestModule(ctx, "test-b")
      ctx.addModule(testModule)

      try {
        ctx.addModule(testModuleB)
      } catch (err) {
        expect(err.type).to.equal("configuration")
        return
      }

      throw new Error("Expected error")
    })

    it("should allow adding service multiple times with force parameter", async () => {
      const ctx = makeTestContextA()

      const testModule = makeTestModule(ctx)
      const testModuleB = makeTestModule(ctx, "test-b")
      ctx.addModule(testModule)
      ctx.addModule(testModuleB, true)

      const services = await ctx.getServices(undefined, true)
      expect(Object.keys(services)).to.eql(["testService"])
    })
  })

  describe("resolveModule", () => {
    it("should return named module", async () => {
      const ctx = makeTestContextA()
      await ctx.scanModules()

      const module = await ctx.resolveModule("module-a")
      expect(module.name).to.equal("module-a")
    })

    it("should throw if named module is requested and not available", async () => {
      const ctx = makeTestContextA()

      try {
        await ctx.resolveModule("module-a")
      } catch (err) {
        expect(err.type).to.equal("configuration")
        return
      }

      throw new Error("Expected error")
    })

    it("should resolve module by absolute path", async () => {
      const ctx = makeTestContextA()
      const path = join(projectRootA, "module-a")

      const module = await ctx.resolveModule(path)
      expect(module.name).to.equal("module-a")
    })

    it("should resolve module by relative path to project root", async () => {
      const ctx = makeTestContextA()

      const module = await ctx.resolveModule("./module-a")
      expect(module.name).to.equal("module-a")
    })
  })

  describe("getActionHandlers", () => {
    it("should return all handlers for a type", async () => {
      const ctx = makeTestContextA()

      const handlers = ctx.getActionHandlers("parseModule")

      expect(Object.keys(handlers)).to.eql([
        "generic",
        "container-module",
        "npm-package-module",
        "google-app-engine",
        "google-cloud-functions",
        "local-google-cloud-functions",
        "test-plugin-b",
      ])
    })

    it("should optionally limit to handlers for specific module type", async () => {
      const ctx = makeTestContextA()

      const handlers = ctx.getActionHandlers("parseModule", "generic")

      expect(Object.keys(handlers)).to.eql([
        "generic",
      ])
    })
  })

  describe("getActionHandler", () => {
    it("should return last configured handler for specified action type", async () => {
      const ctx = makeTestContextA()

      const handler = ctx.getActionHandler("parseModule")

      expect(handler["actionType"]).to.equal("parseModule")
      expect(handler["pluginName"]).to.equal("test-plugin-b")
    })

    it("should optionally filter to only handlers for the specified module type", async () => {
      const ctx = makeTestContextA()

      const handler = ctx.getActionHandler("parseModule", "container")

      expect(handler["actionType"]).to.equal("parseModule")
      expect(handler["pluginName"]).to.equal("test-plugin-b")
    })

    it("should throw if no handler is available", async () => {
      const ctx = makeTestContextA()

      try {
        ctx.getActionHandler("deployService", "generic")
      } catch (err) {
        expect(err.type).to.equal("parameter")
        return
      }

      throw new Error("Expected error")
    })
  })

  describe("getEnvActionHandlers", () => {
    it("should return all handlers for a type that are configured for the set environment", async () => {
      const ctx = makeTestContextA()
      ctx.setEnvironment("test")

      const handlers = ctx.getEnvActionHandlers("configureEnvironment")
      expect(Object.keys(handlers)).to.eql(["test-plugin", "test-plugin-b"])
    })

    it("should optionally limit to handlers that support a specific module type", async () => {
      const ctx = makeTestContextA()
      ctx.setEnvironment("test")

      const handlers = ctx.getEnvActionHandlers("configureEnvironment", "container")
      expect(Object.keys(handlers)).to.eql(["test-plugin-b"])
    })

    it("should throw if environment has not been set", async () => {
      const ctx = makeTestContextA()

      try {
        ctx.getEnvActionHandlers("configureEnvironment", "container")
      } catch (err) {
        expect(err.type).to.equal("plugin")
      }
    })
  })

  describe("getEnvActionHandler", () => {
    it("should return last configured handler for specified action type", async () => {
      const ctx = makeTestContextA()
      ctx.setEnvironment("test")

      const handler = ctx.getEnvActionHandler("configureEnvironment")

      expect(handler["actionType"]).to.equal("configureEnvironment")
      expect(handler["pluginName"]).to.equal("test-plugin-b")
    })

    it("should optionally filter to only handlers for the specified module type", async () => {
      const ctx = makeTestContextA()
      ctx.setEnvironment("test")

      const handler = ctx.getEnvActionHandler("deployService", "container")

      expect(handler["actionType"]).to.equal("deployService")
      expect(handler["pluginName"]).to.equal("test-plugin-b")
    })

    it("should throw if no handler is available", async () => {
      const ctx = makeTestContextA()
      ctx.setEnvironment("test")

      try {
        ctx.getEnvActionHandler("deployService", "generic")
      } catch (err) {
        expect(err.type).to.equal("parameter")
        return
      }

      throw new Error("Expected error")
    })
  })
})
