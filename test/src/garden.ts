import { expect } from "chai"
import { join } from "path"
import { Garden } from "../../src/garden"
import { detectCycles } from "../../src/util/detectCycles"
import {
  dataDir,
  expectError,
  makeTestGarden,
  makeTestGardenA,
  makeTestModule,
  projectRootA,
  testPlugin,
  testPluginB,
} from "../helpers"
import { getNames } from "../../src/util/util"

describe("Garden", () => {
  describe("factory", () => {
    it("should throw when initializing with missing plugins", async () => {
      await expectError(async () => await Garden.factory(projectRootA), "configuration")
    })

    it("should initialize and add the action handlers for a plugin", async () => {
      const ctx = await makeTestGardenA()

      expect(ctx.actionHandlers.configureEnvironment["test-plugin"]).to.be.ok
      expect(ctx.actionHandlers.configureEnvironment["test-plugin-b"]).to.be.ok
    })

    it("should throw if registering same plugin twice", async () => {
      try {
        await Garden.factory(projectRootA, {
          plugins: ["test-plugin", "test-plugin"],
        })
      } catch (err) {
        expect(err.type).to.equal("configuration")
        return
      }

      throw new Error("Expected error")
    })

    it("should parse and resolve the config from the project root", async () => {
      const ctx = await makeTestGardenA()

      expect(ctx.projectName).to.equal("test-project-a")
      expect(ctx.config).to.eql({
        name: "local",
        providers: [
          { name: "test-plugin" },
          { name: "test-plugin-b" },
        ],
        variables: {
          some: "variable",
        },
      })
    })

    it("should resolve templated env variables in project config", async () => {
      process.env.TEST_PROVIDER_TYPE = "test-plugin"
      process.env.TEST_VARIABLE = "banana"

      const projectRoot = join(__dirname, "..", "data", "test-project-templated")

      const ctx = await makeTestGarden(projectRoot)

      delete process.env.TEST_PROVIDER_TYPE
      delete process.env.TEST_VARIABLE

      expect(ctx.config).to.eql({
        name: "local",
        providers: [
          { name: "test-plugin" },
        ],
        variables: {
          some: "banana",
          "service-a-build-command": "echo OK",
        },
      })
    })

    it("should optionally set a namespace with the dot separator", async () => {
      const garden = await Garden.factory(
        projectRootA, { env: "local.mynamespace", plugins: [testPlugin, testPluginB] },
      )

      const { name, namespace } = garden.getEnvironment()
      expect(name).to.equal("local")
      expect(namespace).to.equal("mynamespace")
    })

    it("should split environment and namespace on the first dot", async () => {
      const garden = await Garden.factory(
        projectRootA, { env: "local.mynamespace.2", plugins: [testPlugin, testPluginB] },
      )

      const { name, namespace } = garden.getEnvironment()
      expect(name).to.equal("local")
      expect(namespace).to.equal("mynamespace.2")
    })

    it("should throw if the specified environment isn't configured", async () => {
      await expectError(async () => Garden.factory(projectRootA, { env: "bla" }), "parameter")
    })

    it("should throw if namespace starts with 'garden-'", async () => {
      await expectError(async () => Garden.factory(projectRootA, { env: "garden-bla" }), "parameter")
    })

    it("should throw if no provider is configured for the environment", async () => {
      await expectError(async () => Garden.factory(projectRootA, { env: "other" }), "configuration")
    })

    it("should throw if plugin module exports invalid name", async () => {
      const pluginPath = join(dataDir, "plugins", "invalid-exported-name.ts")
      const projectRoot = join(dataDir, "test-project-empty")
      await expectError(async () => Garden.factory(projectRoot, { plugins: [pluginPath] }), "plugin")
    })

    it("should throw if plugin module name is not a valid identifier", async () => {
      const pluginPath = join(dataDir, "plugins", "invalidModuleName.ts")
      const projectRoot = join(dataDir, "test-project-empty")
      await expectError(async () => Garden.factory(projectRoot, { plugins: [pluginPath] }), "plugin")
    })

    it("should throw if plugin module doesn't contain factory function", async () => {
      const pluginPath = join(dataDir, "plugins", "missing-factory.ts")
      const projectRoot = join(dataDir, "test-project-empty")
      await expectError(async () => Garden.factory(projectRoot, { plugins: [pluginPath] }), "plugin")
    })
  })

  describe("getEnvironment", () => {
    it("should get the active environment for the context", async () => {
      const ctx = await makeTestGardenA()

      const { name, namespace } = ctx.getEnvironment()
      expect(name).to.equal("local")
      expect(namespace).to.equal("default")
    })
  })

  describe("getModules", () => {
    it("should scan and return all registered modules in the context", async () => {
      const ctx = await makeTestGardenA()
      const modules = await ctx.getModules()

      expect(getNames(modules)).to.eql(["module-a", "module-b", "module-c"])
    })

    it("should optionally return specified modules in the context", async () => {
      const ctx = await makeTestGardenA()
      const modules = await ctx.getModules(["module-b", "module-c"])

      expect(getNames(modules)).to.eql(["module-b", "module-c"])
    })

    it("should throw if named module is missing", async () => {
      const ctx = await makeTestGardenA()

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
      const ctx = await makeTestGardenA()
      const services = await ctx.getServices()

      expect(getNames(services)).to.eql(["service-a", "service-b", "service-c"])
    })

    it("should optionally return specified services in the context", async () => {
      const ctx = await makeTestGardenA()
      const services = await ctx.getServices(["service-b", "service-c"])

      expect(getNames(services)).to.eql(["service-b", "service-c"])
    })

    it("should throw if named service is missing", async () => {
      const ctx = await makeTestGardenA()

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
      const garden = await makeTestGardenA()
      const service = await garden.getService("service-b")

      expect(service.name).to.equal("service-b")
    })

    it("should throw if service is missing", async () => {
      const garden = await makeTestGardenA()

      try {
        await garden.getServices(["bla"])
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
      const garden = await makeTestGardenA()
      await garden.scanModules()

    const modules = await garden.getModules(undefined, true)
      expect(getNames(modules)).to.eql(["module-a", "module-b", "module-c"])
    })

    describe("detectCircularDependencies", () => {
      it("should throw an exception when circular dependencies are present", async () => {
        const circularProjectRoot = join(__dirname, "..", "data", "test-project-circular-deps")
        const garden = await makeTestGarden(circularProjectRoot)
        await expectError(
          async () => await garden.scanModules(),
          "configuration")
      })

      it("should not throw an exception when no circular dependencies are present", async () => {
        const nonCircularProjectRoot = join(__dirname, "..", "data", "test-project-b")
        const garden = await makeTestGarden(nonCircularProjectRoot)
        expect(async () => { await garden.scanModules() }).to.not.throw()
      })
    })

    describe("detectCycles", () => {
      it("should detect self-to-self cycles", () => {
        const cycles = detectCycles({
          a: {a: {distance: 1, next: "a"}},
        }, ["a"])

        expect(cycles).to.deep.eq([["a"]])
      })

      it("should preserve dependency order when returning cycles", () => {
        const cycles = detectCycles({
          foo: {bar: {distance: 1, next: "bar"}},
          bar: {baz: {distance: 1, next: "baz"}},
          baz: {foo: {distance: 1, next: "foo"}},
        }, ["foo", "bar", "baz"])

        expect(cycles).to.deep.eq([["foo", "bar", "baz"]])
      })
    })
  })

  describe("addModule", () => {
    it("should add the given module and its services to the context", async () => {
      const garden = await makeTestGardenA()

      const testModule = makeTestModule(garden.pluginContext)
      await garden.addModule(testModule)

      const modules = await garden.getModules(undefined, true)
      expect(getNames(modules)).to.eql(["test"])

      const services = await garden.getServices(undefined, true)
      expect(getNames(services)).to.eql(["testService"])
    })

    it("should throw when adding module twice without force parameter", async () => {
      const garden = await makeTestGardenA()
      const ctx = garden.pluginContext

      const testModule = makeTestModule(ctx)
      await garden.addModule(testModule)

      try {
        await garden.addModule(testModule)
      } catch (err) {
        expect(err.type).to.equal("configuration")
        return
      }

      throw new Error("Expected error")
    })

    it("should allow adding module multiple times with force parameter", async () => {
      const garden = await makeTestGardenA()
      const ctx = garden.pluginContext

      const testModule = makeTestModule(ctx)
      await garden.addModule(testModule)
      await garden.addModule(testModule, true)

      const modules = await garden.getModules(undefined, true)
      expect(getNames(modules)).to.eql(["test"])
    })

    it("should throw if a service is added twice without force parameter", async () => {
      const garden = await makeTestGardenA()
      const ctx = garden.pluginContext

      const testModule = makeTestModule(ctx)
      const testModuleB = makeTestModule(ctx, { name: "test-b" })
      await garden.addModule(testModule)

      try {
        await garden.addModule(testModuleB)
      } catch (err) {
        expect(err.type).to.equal("configuration")
        return
      }

      throw new Error("Expected error")
    })

    it("should allow adding service multiple times with force parameter", async () => {
      const garden = await makeTestGardenA()
      const ctx = garden.pluginContext

      const testModule = makeTestModule(ctx)
      const testModuleB = makeTestModule(ctx, { name: "test-b" })
      await garden.addModule(testModule)
      await garden.addModule(testModuleB, true)

      const services = await ctx.getServices(undefined, true)
      expect(getNames(services)).to.eql(["testService"])
    })
  })

  describe("resolveModule", () => {
    it("should return named module", async () => {
      const garden = await makeTestGardenA()
      await garden.scanModules()

      const module = await garden.resolveModule("module-a")
      expect(module!.name).to.equal("module-a")
    })

    it("should throw if named module is requested and not available", async () => {
      const garden = await makeTestGardenA()

      try {
        await garden.resolveModule("module-a")
      } catch (err) {
        expect(err.type).to.equal("configuration")
        return
      }

      throw new Error("Expected error")
    })

    it("should resolve module by absolute path", async () => {
      const garden = await makeTestGardenA()
      const path = join(projectRootA, "module-a")

      const module = await garden.resolveModule(path)
      expect(module!.name).to.equal("module-a")
    })

    it("should resolve module by relative path to project root", async () => {
      const garden = await makeTestGardenA()

      const module = await garden.resolveModule("./module-a")
      expect(module!.name).to.equal("module-a")
    })
  })

  describe("getTemplateContext", () => {
    it("should return the basic project context without parameters", async () => {
      const ctx = await makeTestGardenA()

      const result = await ctx.getTemplateContext()

      expect(Object.keys(result).length).to.equal(4)
      expect(result.config).to.be.a("function")
      expect(result.variables).to.eql({ some: "variable" })
      expect(result.local).to.eql({ env: process.env })
      expect(result.environment).to.eql({
        name: "local",
        config: {
          name: "local",
          providers: [
            { name: "test-plugin" },
            { name: "test-plugin-b" },
          ],
          variables: {
            some: "variable",
          },
        },
      })
    })

    it("should extend the basic project context if specified", async () => {
      const ctx = await makeTestGardenA()

      const result = await ctx.getTemplateContext({ my: "things" })

      expect(Object.keys(result).length).to.equal(5)
      expect(result.config).to.be.a("function")
      expect(result.variables).to.eql({ some: "variable" })
      expect(result.local).to.eql({ env: process.env })
      expect(result.environment).to.eql({
        name: "local",
        config: {
          name: "local",
          providers: [
            { name: "test-plugin" },
            { name: "test-plugin-b" },
          ],
          variables: {
            some: "variable",
          },
        },
      })
      expect(result.my).to.eql("things")
    })
  })

  describe("getActionHandlers", () => {
    it("should return all handlers for a type", async () => {
      const ctx = await makeTestGardenA()

      const handlers = ctx.getActionHandlers("configureEnvironment")

      expect(Object.keys(handlers)).to.eql([
        "test-plugin",
        "test-plugin-b",
      ])
    })
  })

  describe("getModuleActionHandlers", () => {
    it("should return all handlers for a type", async () => {
      const ctx = await makeTestGardenA()

      const handlers = ctx.getModuleActionHandlers("buildModule", "generic")

      expect(Object.keys(handlers)).to.eql([
        "generic",
      ])
    })
  })

  describe("getActionHandler", () => {
    it("should return last configured handler for specified action type", async () => {
      const ctx = await makeTestGardenA()

      const handler = ctx.getActionHandler("configureEnvironment")

      expect(handler["actionType"]).to.equal("configureEnvironment")
      expect(handler["pluginName"]).to.equal("test-plugin-b")
    })

    it("should optionally filter to only handlers for the specified module type", async () => {
      const ctx = await makeTestGardenA()

      const handler = ctx.getActionHandler("configureEnvironment")

      expect(handler["actionType"]).to.equal("configureEnvironment")
      expect(handler["pluginName"]).to.equal("test-plugin-b")
    })

    it("should throw if no handler is available", async () => {
      const ctx = await makeTestGardenA()
      await expectError(() => ctx.getActionHandler("destroyEnvironment"), "parameter")
    })
  })

  describe("getModuleActionHandler", () => {
    it("should return last configured handler for specified module action type", async () => {
      const ctx = await makeTestGardenA()

      const handler = ctx.getModuleActionHandler("deployService", "test")

      expect(handler["actionType"]).to.equal("deployService")
      expect(handler["pluginName"]).to.equal("test-plugin-b")
    })

    it("should throw if no handler is available", async () => {
      const ctx = await makeTestGardenA()
      await expectError(() => ctx.getModuleActionHandler("execInService", "container"), "parameter")
    })
  })
})
