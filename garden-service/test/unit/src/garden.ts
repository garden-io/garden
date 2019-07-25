import { expect } from "chai"
import * as td from "testdouble"
import { join, resolve } from "path"
import { Garden } from "../../../src/garden"
import {
  dataDir,
  expectError,
  makeTestGarden,
  makeTestGardenA,
  projectRootA,
  stubExtSources,
  getDataDir,
  cleanProject,
  testModuleVersion,
  TestGarden,
  testPlugin,
} from "../../helpers"
import { getNames } from "../../../src/util/util"
import { MOCK_CONFIG } from "../../../src/cli/cli"
import { LinkedSource } from "../../../src/config-store"
import { ModuleVersion } from "../../../src/vcs/vcs"
import { hashRepoUrl } from "../../../src/util/ext-source-util"
import { getModuleCacheContext } from "../../../src/types/module"
import { Plugins, GardenPlugin, PluginFactory } from "../../../src/types/plugin/plugin"
import { ConfigureProviderParams } from "../../../src/types/plugin/provider/configureProvider"
import { ProjectConfig } from "../../../src/config/project"
import { ModuleConfig } from "../../../src/config/module"
import { DEFAULT_API_VERSION } from "../../../src/constants"
import { providerConfigBaseSchema } from "../../../src/config/provider"
import { keyBy, set } from "lodash"
import stripAnsi from "strip-ansi"
import { joi } from "../../../src/config/common"
import { defaultDotIgnoreFiles } from "../../../src/util/fs"

describe("Garden", () => {
  beforeEach(async () => {
    td.replace(Garden.prototype, "resolveVersion", async () => testModuleVersion)
  })

  describe("factory", () => {
    it("should initialize and add the action handlers for a plugin", async () => {
      const garden = await makeTestGardenA()
      const actions = await garden.getActionHelper()

      expect((<any>actions).actionHandlers.prepareEnvironment["test-plugin"]).to.be.ok
      expect((<any>actions).actionHandlers.prepareEnvironment["test-plugin-b"]).to.be.ok
    })

    it("should initialize with MOCK_CONFIG", async () => {
      const garden = await Garden.factory("./", { config: MOCK_CONFIG })
      expect(garden).to.be.ok
    })

    it("should initialize a project with config files with yaml and yml extensions", async () => {
      const garden = await makeTestGarden(getDataDir("test-project-yaml-file-extensions"))
      expect(garden).to.be.ok
    })

    it("should throw if a project has config files with yaml and yml extensions in the same dir", async () => {
      const path = getDataDir("test-project-duplicate-yaml-file-extensions")
      await expectError(async () => makeTestGarden(path), "validation")
    })

    it("should parse and resolve the config from the project root", async () => {
      const garden = await makeTestGardenA()
      const projectRoot = garden.projectRoot

      expect(garden.projectName).to.equal("test-project-a")

      expect(await garden.resolveProviders()).to.eql([
        {
          name: "exec",
          config: {
            name: "exec",
            path: projectRoot,
          },
          dependencies: [],
          moduleConfigs: [],
        },
        {
          name: "container",
          config: {
            name: "container",
            path: projectRoot,
          },
          dependencies: [],
          moduleConfigs: [],
        },
        {
          name: "test-plugin",
          config: {
            name: "test-plugin",
            environments: ["local"],
            path: projectRoot,
          },
          dependencies: [],
          moduleConfigs: [],
        },
        {
          name: "test-plugin-b",
          config: {
            name: "test-plugin-b",
            environments: ["local"],
            path: projectRoot,
          },
          dependencies: [],
          moduleConfigs: [],
        },
      ])

      expect(garden.variables).to.eql({
        some: "variable",
      })
    })

    it("should resolve templated env variables in project config", async () => {
      process.env.TEST_PROVIDER_TYPE = "test-plugin"
      process.env.TEST_VARIABLE = "banana"

      const projectRoot = join(dataDir, "test-project-templated")

      const garden = await makeTestGarden(projectRoot)

      delete process.env.TEST_PROVIDER_TYPE
      delete process.env.TEST_VARIABLE

      expect(await garden.resolveProviders()).to.eql([
        {
          name: "exec",
          config: {
            name: "exec",
            path: projectRoot,
          },
          dependencies: [],
          moduleConfigs: [],
        },
        {
          name: "container",
          config: {
            name: "container",
            path: projectRoot,
          },
          dependencies: [],
          moduleConfigs: [],
        },
        {
          name: "test-plugin",
          config: {
            name: "test-plugin",
            path: projectRoot,
            environments: ["local"],
          },
          dependencies: [],
          moduleConfigs: [],
        },
      ])

      expect(garden.variables).to.eql({
        "some": "banana",
        "service-a-build-command": "OK",
      })
    })

    it("should throw if the specified environment isn't configured", async () => {
      await expectError(async () => Garden.factory(projectRootA, { environmentName: "bla" }), "parameter")
    })

    it("should throw if environment starts with 'garden-'", async () => {
      await expectError(async () => Garden.factory(projectRootA, { environmentName: "garden-bla" }), "parameter")
    })

    it("should throw if plugin module exports invalid name", async () => {
      const pluginPath = join(__dirname, "plugins", "invalid-exported-name.js")
      const plugins = { foo: pluginPath }
      const projectRoot = join(dataDir, "test-project-empty")
      await expectError(async () => Garden.factory(projectRoot, { plugins }), "plugin")
    })

    it("should throw if plugin module name is not a valid identifier", async () => {
      const pluginPath = join(__dirname, "plugins", "invalidModuleName.js")
      const plugins = { foo: pluginPath }
      const projectRoot = join(dataDir, "test-project-empty")
      await expectError(async () => Garden.factory(projectRoot, { plugins }), "plugin")
    })

    it("should throw if plugin module doesn't contain factory function", async () => {
      const pluginPath = join(__dirname, "plugins", "missing-factory.js")
      const plugins = { foo: pluginPath }
      const projectRoot = join(dataDir, "test-project-empty")
      await expectError(async () => Garden.factory(projectRoot, { plugins }), "plugin")
    })

    it("should set .garden as the default cache dir", async () => {
      const projectRoot = join(dataDir, "test-project-empty")
      const garden = await Garden.factory(projectRoot, { plugins: { "test-plugin": testPlugin } })
      expect(garden.gardenDirPath).to.eql(join(projectRoot, ".garden"))
    })

    it("should optionally set a custom cache dir relative to project root", async () => {
      const projectRoot = join(dataDir, "test-project-empty")
      const garden = await Garden.factory(projectRoot, {
        plugins: { "test-plugin": testPlugin },
        gardenDirPath: "my/cache/dir",
      })
      expect(garden.gardenDirPath).to.eql(join(projectRoot, "my/cache/dir"))
    })

    it("should optionally set a custom cache dir with an absolute path", async () => {
      const projectRoot = join(dataDir, "test-project-empty")
      const gardenDirPath = join(dataDir, "test-garden-dir")
      const garden = await Garden.factory(projectRoot, {
        plugins: { "test-plugin": testPlugin },
        gardenDirPath,
      })
      expect(garden.gardenDirPath).to.eql(gardenDirPath)
    })
  })

  describe("resolveProviders", () => {
    it("should throw when when plugins are missing", async () => {
      const garden = await Garden.factory(projectRootA)
      await expectError(() => garden.resolveProviders(), "configuration")
    })

    it("should pass through a basic provider config", async () => {
      const garden = await makeTestGardenA()
      const projectRoot = garden.projectRoot

      expect(await garden.resolveProviders()).to.eql([
        {
          name: "exec",
          config: {
            name: "exec",
            path: projectRoot,
          },
          dependencies: [],
          moduleConfigs: [],
        },
        {
          name: "container",
          config: {
            name: "container",
            path: projectRoot,
          },
          dependencies: [],
          moduleConfigs: [],
        },
        {
          name: "test-plugin",
          config: {
            name: "test-plugin",
            environments: ["local"],
            path: projectRoot,
          },
          dependencies: [],
          moduleConfigs: [],
        },
        {
          name: "test-plugin-b",
          config: {
            name: "test-plugin-b",
            environments: ["local"],
            path: projectRoot,
          },
          dependencies: [],
          moduleConfigs: [],
        },
      ])
    })

    it("should call a configureProvider handler if applicable", async () => {
      const test: PluginFactory = (): GardenPlugin => {
        return {
          actions: {
            async configureProvider({ config }: ConfigureProviderParams) {
              expect(config).to.eql({
                name: "test",
                path: projectRootA,
                foo: "bar",
              })
              return { config }
            },
          },
        }
      }

      const projectConfig: ProjectConfig = {
        apiVersion: "garden.io/v0",
        kind: "Project",
        name: "test",
        path: projectRootA,
        defaultEnvironment: "default",
        dotIgnoreFiles: defaultDotIgnoreFiles,
        environments: [
          { name: "default", variables: {} },
        ],
        providers: [
          { name: "test", foo: "bar" },
        ],
        variables: {},
      }

      const plugins: Plugins = { test }
      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins })
      await garden.resolveProviders()
    })

    it("should give a readable error if provider configs have invalid template strings", async () => {
      const test: PluginFactory = (): GardenPlugin => {
        return {}
      }

      const projectConfig: ProjectConfig = {
        apiVersion: "garden.io/v0",
        kind: "Project",
        name: "test",
        path: projectRootA,
        defaultEnvironment: "default",
        dotIgnoreFiles: defaultDotIgnoreFiles,
        environments: [
          { name: "default", variables: {} },
        ],
        providers: [
          { name: "test", foo: "\${bla.ble}" },
        ],
        variables: {},
      }

      const plugins: Plugins = { test }
      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins })
      await expectError(
        () => garden.resolveProviders(),
        err => expect(err.message).to.equal(
          "Failed resolving one or more provider configurations:\n- test: Could not find key: bla.ble",
        ),
      )
    })

    it("should give a readable error if providers reference non-existent providers", async () => {
      const test: PluginFactory = (): GardenPlugin => {
        return {
          dependencies: ["foo"],
        }
      }

      const projectConfig: ProjectConfig = {
        apiVersion: "garden.io/v0",
        kind: "Project",
        name: "test",
        path: projectRootA,
        defaultEnvironment: "default",
        dotIgnoreFiles: defaultDotIgnoreFiles,
        environments: [
          { name: "default", variables: {} },
        ],
        providers: [
          { name: "test" },
        ],
        variables: {},
      }

      const plugins: Plugins = { test }
      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins })
      await expectError(
        () => garden.resolveProviders(),
        err => expect(err.message).to.equal(
          "Missing provider dependency 'foo' in configuration for provider 'test'. " +
          "Are you missing a provider configuration?",
        ),
      )
    })

    it("should add plugin modules if returned by the provider", async () => {
      const pluginModule: ModuleConfig = {
        apiVersion: DEFAULT_API_VERSION,
        allowPublish: false,
        build: { dependencies: [] },
        name: "foo",
        outputs: {},
        path: "/tmp",
        serviceConfigs: [],
        taskConfigs: [],
        spec: {},
        testConfigs: [],
        type: "exec",
      }

      const test: PluginFactory = (): GardenPlugin => {
        return {
          actions: {
            async configureProvider({ config }: ConfigureProviderParams) {
              return { config, moduleConfigs: [pluginModule] }
            },
          },
          moduleActions: {
            test: {
              configure: async ({ moduleConfig }) => {
                return moduleConfig
              },
            },
          },
        }
      }

      const projectConfig: ProjectConfig = {
        apiVersion: "garden.io/v0",
        kind: "Project",
        name: "test",
        path: projectRootA,
        defaultEnvironment: "default",
        dotIgnoreFiles: defaultDotIgnoreFiles,
        environments: [
          { name: "default", variables: {} },
        ],
        providers: [
          { name: "test", foo: "bar" },
        ],
        variables: {},
      }

      const plugins: Plugins = { test }
      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins })

      const graph = await garden.getConfigGraph()
      expect(await graph.getModule("test--foo")).to.exist
    })

    it("should throw if plugins have declared circular dependencies", async () => {
      const testA: PluginFactory = (): GardenPlugin => {
        return {
          dependencies: ["test-b"],
        }
      }

      const testB: PluginFactory = (): GardenPlugin => {
        return {
          dependencies: ["test-a"],
        }
      }

      const projectConfig: ProjectConfig = {
        apiVersion: "garden.io/v0",
        kind: "Project",
        name: "test",
        path: projectRootA,
        defaultEnvironment: "default",
        dotIgnoreFiles: defaultDotIgnoreFiles,
        environments: [
          { name: "default", variables: {} },
        ],
        providers: [
          { name: "test-a" },
          { name: "test-b" },
        ],
        variables: {},
      }

      const plugins: Plugins = { "test-a": testA, "test-b": testB }
      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins })

      await expectError(
        () => garden.resolveProviders(),
        err => expect(err.message).to.equal(
          "One or more circular dependencies found between providers " +
          "or their configurations: test-a <- test-b <- test-a",
        ),
      )
    })

    it("should throw if plugins reference themselves as dependencies", async () => {
      const testA: PluginFactory = (): GardenPlugin => {
        return {
          dependencies: ["test-a"],
        }
      }

      const projectConfig: ProjectConfig = {
        apiVersion: "garden.io/v0",
        kind: "Project",
        name: "test",
        path: projectRootA,
        defaultEnvironment: "default",
        dotIgnoreFiles: defaultDotIgnoreFiles,
        environments: [
          { name: "default", variables: {} },
        ],
        providers: [
          { name: "test-a" },
        ],
        variables: {},
      }

      const plugins: Plugins = { "test-a": testA }
      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins })

      await expectError(
        () => garden.resolveProviders(),
        err => expect(err.message).to.equal(
          "One or more circular dependencies found between providers " +
          "or their configurations: test-a <- test-a",
        ),
      )
    })

    it("should throw if provider configs have implicit circular dependencies", async () => {
      const testA: PluginFactory = (): GardenPlugin => {
        return {}
      }

      const testB: PluginFactory = (): GardenPlugin => {
        return {}
      }

      const projectConfig: ProjectConfig = {
        apiVersion: "garden.io/v0",
        kind: "Project",
        name: "test",
        path: projectRootA,
        defaultEnvironment: "default",
        dotIgnoreFiles: defaultDotIgnoreFiles,
        environments: [
          { name: "default", variables: {} },
        ],
        providers: [
          { name: "test-a", foo: "\${provider.test-b.outputs.foo}" },
          { name: "test-b", foo: "\${provider.test-a.outputs.foo}" },
        ],
        variables: {},
      }

      const plugins: Plugins = { "test-a": testA, "test-b": testB }
      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins })

      await expectError(
        () => garden.resolveProviders(),
        err => expect(err.message).to.equal(
          "One or more circular dependencies found between providers " +
          "or their configurations: test-a <- test-b <- test-a",
        ),
      )
    })

    it("should throw if provider configs have combined implicit and declared circular dependencies", async () => {
      const testA: PluginFactory = (): GardenPlugin => {
        return {}
      }

      const testB: PluginFactory = (): GardenPlugin => {
        return {
          dependencies: ["test-a"],
        }
      }

      const projectConfig: ProjectConfig = {
        apiVersion: "garden.io/v0",
        kind: "Project",
        name: "test",
        path: projectRootA,
        defaultEnvironment: "default",
        dotIgnoreFiles: defaultDotIgnoreFiles,
        environments: [
          { name: "default", variables: {} },
        ],
        providers: [
          { name: "test-a", foo: "\${provider.test-b.outputs.foo}" },
          { name: "test-b" },
        ],
        variables: {},
      }

      const plugins: Plugins = { "test-a": testA, "test-b": testB }
      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins })

      await expectError(
        () => garden.resolveProviders(),
        err => expect(err.message).to.equal(
          "One or more circular dependencies found between providers " +
          "or their configurations: test-b <- test-a <- test-b",
        ),
      )
    })

    it("should apply default values from a plugin's configuration schema if specified", async () => {
      const test: PluginFactory = (): GardenPlugin => {
        return {
          configSchema: providerConfigBaseSchema
            .keys({
              foo: joi.string().default("bar"),
            }),
        }
      }

      const projectConfig: ProjectConfig = {
        apiVersion: "garden.io/v0",
        kind: "Project",
        name: "test",
        path: projectRootA,
        defaultEnvironment: "default",
        dotIgnoreFiles: defaultDotIgnoreFiles,
        environments: [
          { name: "default", variables: {} },
        ],
        providers: [
          { name: "test" },
        ],
        variables: {},
      }

      const plugins: Plugins = { test }
      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins })
      const providers = keyBy(await garden.resolveProviders(), "name")

      expect(providers.test).to.exist
      expect(providers.test.config.foo).to.equal("bar")
    })

    it("should throw if a config doesn't match a plugin's configuration schema", async () => {
      const test: PluginFactory = (): GardenPlugin => {
        return {
          configSchema: providerConfigBaseSchema
            .keys({
              foo: joi.string(),
            }),
        }
      }

      const projectConfig: ProjectConfig = {
        apiVersion: "garden.io/v0",
        kind: "Project",
        name: "test",
        path: projectRootA,
        defaultEnvironment: "default",
        dotIgnoreFiles: defaultDotIgnoreFiles,
        environments: [
          { name: "default", variables: {} },
        ],
        providers: [
          { name: "test", foo: 123 },
        ],
        variables: {},
      }

      const plugins: Plugins = { test }
      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins })

      await expectError(
        () => garden.resolveProviders(),
        err => expect(stripAnsi(err.message)).to.equal(
          "Failed resolving one or more provider configurations:\n- " +
          "test: Error validating provider (/garden.yml): key .foo must be a string",
        ),
      )
    })
  })

  describe("scanForConfigs", () => {
    it("should find all garden configs in the project directory", async () => {
      const garden = await makeTestGardenA()
      const files = await garden.scanForConfigs(garden.projectRoot)
      expect(files).to.eql([
        join(garden.projectRoot, "garden.yml"),
        join(garden.projectRoot, "module-a", "garden.yml"),
        join(garden.projectRoot, "module-b", "garden.yml"),
        join(garden.projectRoot, "module-c", "garden.yml"),
      ])
    })

    it("should respect the include option, if specified", async () => {
      const garden = await makeTestGardenA()
      set(garden, "moduleIncludePatterns", ["module-a/**/*"])
      const files = await garden.scanForConfigs(garden.projectRoot)
      expect(files).to.eql([
        join(garden.projectRoot, "module-a", "garden.yml"),
      ])
    })

    it("should respect the exclude option, if specified", async () => {
      const garden = await makeTestGardenA()
      set(garden, "moduleExcludePatterns", ["module-a/**/*"])
      const files = await garden.scanForConfigs(garden.projectRoot)
      expect(files).to.eql([
        join(garden.projectRoot, "garden.yml"),
        join(garden.projectRoot, "module-b", "garden.yml"),
        join(garden.projectRoot, "module-c", "garden.yml"),
      ])
    })

    it("should respect the include and exclude options, if both are specified", async () => {
      const garden = await makeTestGardenA()
      set(garden, "moduleIncludePatterns", ["module*/**/*"])
      set(garden, "moduleExcludePatterns", ["module-a/**/*"])
      const files = await garden.scanForConfigs(garden.projectRoot)
      expect(files).to.eql([
        join(garden.projectRoot, "module-b", "garden.yml"),
        join(garden.projectRoot, "module-c", "garden.yml"),
      ])
    })
  })

  describe("scanModules", () => {
    // TODO: assert that gitignore in project root is respected
    it("should scan the project root for modules and add to the context", async () => {
      const garden = await makeTestGardenA()
      await garden.scanModules()

      const modules = await garden.resolveModuleConfigs()
      expect(getNames(modules).sort()).to.eql(["module-a", "module-b", "module-c"])
    })

    it("should scan and add modules for projects with configs defining multiple modules", async () => {
      const garden = await makeTestGarden(resolve(dataDir, "test-projects", "multiple-module-config"))
      await garden.scanModules()

      const modules = await garden.resolveModuleConfigs()
      expect(getNames(modules).sort()).to.eql([
        "module-a1",
        "module-a2",
        "module-b1",
        "module-b2",
        "module-c",
        "module-from-project-config",
      ])
    })

    it("should scan and add modules for projects with external project sources", async () => {
      const garden = await makeTestGarden(resolve(dataDir, "test-project-ext-project-sources"), {
        gardenDirPath: "mock-dot-garden",
      })

      const getRemoteSourceRelPath = td.replace(garden.vcs, "getRemoteSourceRelPath")
      td.when(getRemoteSourceRelPath("source-a"), { ignoreExtraArgs: true })
        .thenReturn(join("sources", "project", "source-a"))
      td.when(getRemoteSourceRelPath("source-b"), { ignoreExtraArgs: true })
        .thenReturn(join("sources", "project", "source-b"))
      td.when(getRemoteSourceRelPath("source-c"), { ignoreExtraArgs: true })
        .thenReturn(join("sources", "project", "source-c"))

      stubExtSources(garden)

      await garden.scanModules()

      const modules = await garden.resolveModuleConfigs()
      expect(getNames(modules).sort()).to.eql(["module-a", "module-b", "module-c"])
    })

    it("should throw when two modules have the same name", async () => {
      const garden = await makeTestGarden(resolve(dataDir, "test-projects", "duplicate-module"))

      await expectError(
        () => garden.scanModules(),
        err => expect(err.message).to.equal(
          "Module module-a is declared multiple times (in 'module-a/garden.yml' and 'module-b/garden.yml')",
        ),
      )
    })

    it("should scan and add modules with config files with yaml and yml extensions", async () => {
      const garden = await makeTestGarden(getDataDir("test-project-yaml-file-extensions"))
      const modules = await garden.resolveModuleConfigs()
      expect(getNames(modules).sort()).to.eql(["module-yaml", "module-yml"])
    })

    it("should respect the modules.include and modules.exclude fields, if specified", async () => {
      const projectRoot = getDataDir("test-projects", "project-include-exclude")
      const garden = await makeTestGarden(projectRoot)
      const moduleConfigs = await garden.resolveModuleConfigs()

      // Should NOT include "nope" and "module-c"
      expect(getNames(moduleConfigs).sort()).to.eql(["module-a", "module-b"])
    })

    it("should respect .gitignore and .gardenignore files", async () => {
      const projectRoot = getDataDir("test-projects", "dotignore")
      const garden = await makeTestGarden(projectRoot)
      const moduleConfigs = await garden.resolveModuleConfigs()

      expect(getNames(moduleConfigs).sort()).to.eql(["module-a"])
    })

    it("should respect custom dotignore files", async () => {
      const projectRoot = getDataDir("test-projects", "dotignore")
      const garden = await makeTestGarden(projectRoot)
      const moduleConfigs = await garden.resolveModuleConfigs()

      expect(getNames(moduleConfigs).sort()).to.eql(["module-a"])
    })
  })

  describe("loadModuleConfigs", () => {
    it("should resolve module by absolute path", async () => {
      const garden = await makeTestGardenA()
      const path = join(projectRootA, "module-a")

      const module = (await (<any>garden).loadModuleConfigs(path))[0]
      expect(module!.name).to.equal("module-a")
    })

    it("should resolve module by relative path to project root", async () => {
      const garden = await makeTestGardenA()

      const module = (await (<any>garden).loadModuleConfigs("./module-a"))[0]
      expect(module!.name).to.equal("module-a")
    })
  })

  describe("resolveModuleConfigs", () => {
    it("should throw if a module references itself in a template string", async () => {
      const projectRoot = resolve(dataDir, "test-projects", "module-self-ref")
      const garden = await makeTestGarden(projectRoot)
      await expectError(
        () => garden.resolveModuleConfigs(),
        (err) => expect(err.message).to.equal(
          "Circular reference detected when resolving key modules.module-a (from modules.module-a)",
        ),
      )
    })

    it("should resolve module path to external sources dir if module has a remote source", async () => {
      const projectRoot = resolve(dataDir, "test-project-ext-module-sources")
      const garden = await makeTestGarden(projectRoot)
      stubExtSources(garden)

      const module = await garden.resolveModuleConfig("module-a")
      const repoUrlHash = hashRepoUrl(module!.repositoryUrl!)

      expect(module!.path).to.equal(join(projectRoot, ".garden", "sources", "module", `module-a--${repoUrlHash}`))
    })

    it.skip("should set default values properly", async () => {
      throw new Error("TODO")
    })

    it("should handle template variables for non-string fields", async () => {
      const projectRoot = getDataDir("test-projects", "non-string-template-values")
      const garden = await makeTestGarden(projectRoot)

      const module = await garden.resolveModuleConfig("module-a")

      // We template in the value for the module's allowPublish field to test this
      expect(module.allowPublish).to.equal(false)
    })
  })

  describe("resolveVersion", () => {
    beforeEach(() => td.reset())

    it("should return result from cache if available", async () => {
      const garden = await makeTestGardenA()
      const module = await garden.resolveModuleConfig("module-a")
      const version: ModuleVersion = {
        versionString: "banana",
        dependencyVersions: {},
        files: [],
      }
      garden.cache.set(["moduleVersions", module.name], version, getModuleCacheContext(module))

      const result = await garden.resolveVersion("module-a", [])

      expect(result).to.eql(version)
    })

    it("should otherwise return version from VCS handler", async () => {
      const garden = await makeTestGardenA()
      await garden.scanModules()

      garden.cache.delete(["moduleVersions", "module-b"])

      const resolveStub = td.replace(garden.vcs, "resolveVersion")
      const version: ModuleVersion = {
        versionString: "banana",
        dependencyVersions: {},
        files: [],
      }

      td.when(resolveStub(), { ignoreExtraArgs: true }).thenResolve(version)

      const result = await garden.resolveVersion("module-b", [])

      expect(result).to.eql(version)
    })

    it("should ignore cache if force=true", async () => {
      const garden = await makeTestGardenA()
      const module = await garden.resolveModuleConfig("module-a")
      const version: ModuleVersion = {
        versionString: "banana",
        dependencyVersions: {},
        files: [],
      }
      garden.cache.set(["moduleVersions", module.name], version, getModuleCacheContext(module))

      const result = await garden.resolveVersion("module-a", [], true)

      expect(result).to.not.eql(version)
    })
  })

  describe("loadExtSourcePath", () => {
    let garden: TestGarden

    const makeGarden = async (root) => {
      garden = await makeTestGarden(root)
      stubExtSources(garden)
      return garden
    }

    afterEach(async () => {
      if (garden) {
        await cleanProject(garden.gardenDirPath)
      }
    })

    it("should return the path to the project source if source type is project", async () => {
      const projectRoot = getDataDir("test-project-ext-project-sources")
      garden = await makeGarden(projectRoot)
      const repositoryUrl = "https://github.com/org/repo.git#master"
      const path = await garden.loadExtSourcePath({ repositoryUrl, name: "source-a", sourceType: "project" })
      const repoUrlHash = hashRepoUrl(repositoryUrl)
      expect(path).to.equal(join(projectRoot, ".garden", "sources", "project", `source-a--${repoUrlHash}`))
    })

    it("should return the path to the module source if source type is module", async () => {
      const projectRoot = getDataDir("test-project-ext-module-sources")
      garden = await makeGarden(projectRoot)
      const repositoryUrl = "https://github.com/org/repo.git#master"
      const path = await garden.loadExtSourcePath({ repositoryUrl, name: "module-a", sourceType: "module" })
      const repoUrlHash = hashRepoUrl(repositoryUrl)
      expect(path).to.equal(join(projectRoot, ".garden", "sources", "module", `module-a--${repoUrlHash}`))
    })

    it("should return the local path of the project source if linked", async () => {
      const projectRoot = getDataDir("test-project-ext-project-sources")
      garden = await makeGarden(projectRoot)
      const localPath = join(projectRoot, "mock-local-path", "source-a")

      const linked: LinkedSource[] = [{
        name: "source-a",
        path: localPath,
      }]
      await garden.configStore.set(["linkedProjectSources"], linked)

      const path = await garden.loadExtSourcePath({
        name: "source-a",
        repositoryUrl: "https://github.com/org/repo.git#master",
        sourceType: "project",
      })

      expect(path).to.equal(join(projectRoot, "mock-local-path", "source-a"))
    })

    it("should return the local path of the module source if linked", async () => {
      const projectRoot = getDataDir("test-project-ext-module-sources")
      garden = await makeGarden(projectRoot)
      const localPath = join(projectRoot, "mock-local-path", "module-a")

      const linked: LinkedSource[] = [{
        name: "module-a",
        path: localPath,
      }]
      await garden.configStore.set(["linkedModuleSources"], linked)

      const path = await garden.loadExtSourcePath({
        name: "module-a",
        repositoryUrl: "https://github.com/org/repo.git#master",
        sourceType: "module",
      })

      expect(path).to.equal(join(projectRoot, "mock-local-path", "module-a"))
    })
  })
})
