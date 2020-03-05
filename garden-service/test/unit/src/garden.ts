/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import td from "testdouble"
import tmp from "tmp-promise"
import { join, resolve } from "path"
import { Garden } from "../../../src/garden"
import {
  dataDir,
  expectError,
  makeTestGarden,
  makeTestGardenA,
  projectRootA,
  getDataDir,
  testModuleVersion,
  TestGarden,
  testPlugin,
  makeExtProjectSourcesGarden,
  makeExtModuleSourcesGarden,
  testGitUrlHash,
  resetLocalConfig,
  testGitUrl,
} from "../../helpers"
import { getNames, findByName, deepOmitUndefined } from "../../../src/util/util"
import { LinkedSource } from "../../../src/config-store"
import { ModuleVersion } from "../../../src/vcs/vcs"
import { getModuleCacheContext } from "../../../src/types/module"
import { createGardenPlugin } from "../../../src/types/plugin/plugin"
import { ConfigureProviderParams } from "../../../src/types/plugin/provider/configureProvider"
import { ProjectConfig } from "../../../src/config/project"
import { ModuleConfig, baseModuleSpecSchema, baseBuildSpecSchema } from "../../../src/config/module"
import { DEFAULT_API_VERSION } from "../../../src/constants"
import { providerConfigBaseSchema } from "../../../src/config/provider"
import { keyBy, set } from "lodash"
import stripAnsi from "strip-ansi"
import { joi } from "../../../src/config/common"
import { defaultDotIgnoreFiles } from "../../../src/util/fs"
import { realpath, writeFile } from "fs-extra"
import { dedent, deline } from "../../../src/util/string"
import { ServiceState } from "../../../src/types/service"
import execa from "execa"

describe("Garden", () => {
  let tmpDir: tmp.DirectoryResult
  let pathFoo: string
  let projectConfigFoo: ProjectConfig

  before(async () => {
    tmpDir = await tmp.dir({ unsafeCleanup: true })
    pathFoo = tmpDir.path

    await execa("git", ["init"], { cwd: pathFoo })

    projectConfigFoo = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "test",
      path: pathFoo,
      defaultEnvironment: "default",
      dotIgnoreFiles: [],
      environments: [{ name: "default", variables: {} }],
      providers: [{ name: "foo" }],
      variables: {},
    }
  })

  after(async () => {
    await tmpDir.cleanup()
  })

  beforeEach(async () => {
    td.replace(Garden.prototype, "resolveVersion", async () => testModuleVersion)
  })

  describe("factory", () => {
    it("should initialize and add the action handlers for a plugin", async () => {
      const garden = await makeTestGardenA()
      const actions = await garden.getActionRouter()

      expect((<any>actions).actionHandlers.prepareEnvironment["test-plugin"]).to.be.ok
      expect((<any>actions).actionHandlers.prepareEnvironment["test-plugin-b"]).to.be.ok
    })

    it("should initialize a project with config files with yaml and yml extensions", async () => {
      const garden = await makeTestGarden(getDataDir("test-project-yaml-file-extensions"))
      expect(garden).to.be.ok
    })

    it("should always exclude the garden dir", async () => {
      const gardenA = await makeTestGardenA()
      const gardenCustomDir = await makeTestGarden(getDataDir("test-project-a"), {
        gardenDirPath: "custom/garden-dir",
      })
      expect(gardenA.moduleExcludePatterns).to.include(".garden/**/*")
      expect(gardenCustomDir.moduleExcludePatterns).to.include("custom/garden-dir/**/*")
    })

    it("should throw if a project has config files with yaml and yml extensions in the same dir", async () => {
      const path = getDataDir("test-project-duplicate-yaml-file-extensions")
      await expectError(async () => makeTestGarden(path), "validation")
    })

    it("should parse and resolve the config from the project root", async () => {
      const garden = await makeTestGardenA()
      const projectRoot = garden.projectRoot

      const testPluginProvider = {
        name: "test-plugin",
        config: {
          name: "test-plugin",
          environments: ["local"],
          path: projectRoot,
        },
        dependencies: [],
        moduleConfigs: [],
        status: {
          ready: true,
          outputs: {},
        },
      }

      expect(garden.projectName).to.equal("test-project-a")

      expect(await garden.resolveProviders()).to.eql([
        emptyProvider(projectRoot, "exec"),
        emptyProvider(projectRoot, "container"),
        testPluginProvider,
        {
          name: "test-plugin-b",
          config: {
            name: "test-plugin-b",
            environments: ["local"],
            path: projectRoot,
          },
          dependencies: [testPluginProvider],
          moduleConfigs: [],
          status: {
            ready: true,
            outputs: {},
          },
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
        emptyProvider(projectRoot, "exec"),
        emptyProvider(projectRoot, "container"),
        {
          name: "test-plugin",
          config: {
            name: "test-plugin",
            path: projectRoot,
          },
          dependencies: [],
          moduleConfigs: [],
          status: {
            ready: true,
            outputs: {},
          },
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
      const pluginPath = join(__dirname, "plugins", "invalid-name.js")
      const plugins = [pluginPath]
      const projectRoot = join(dataDir, "test-project-empty")
      await expectError(async () => Garden.factory(projectRoot, { plugins }), "plugin")
    })

    it("should throw if plugin module doesn't contain plugin", async () => {
      const pluginPath = join(__dirname, "plugins", "missing-plugin.js")
      const plugins = [pluginPath]
      const projectRoot = join(dataDir, "test-project-empty")
      await expectError(async () => Garden.factory(projectRoot, { plugins }), "plugin")
    })

    it("should set .garden as the default cache dir", async () => {
      const projectRoot = join(dataDir, "test-project-empty")
      const garden = await Garden.factory(projectRoot, { plugins: [testPlugin] })
      expect(garden.gardenDirPath).to.eql(join(projectRoot, ".garden"))
    })

    it("should optionally set a custom cache dir relative to project root", async () => {
      const projectRoot = join(dataDir, "test-project-empty")
      const garden = await Garden.factory(projectRoot, {
        plugins: [testPlugin],
        gardenDirPath: "my/cache/dir",
      })
      expect(garden.gardenDirPath).to.eql(join(projectRoot, "my/cache/dir"))
    })

    it("should optionally set a custom cache dir with an absolute path", async () => {
      const projectRoot = join(dataDir, "test-project-empty")
      const gardenDirPath = join(dataDir, "test-garden-dir")
      const garden = await Garden.factory(projectRoot, {
        plugins: [testPlugin],
        gardenDirPath,
      })
      expect(garden.gardenDirPath).to.eql(gardenDirPath)
    })

    it("should load default varfiles if they exist", async () => {
      const projectRoot = join(dataDir, "test-projects", "varfiles")
      const garden = await Garden.factory(projectRoot, {})
      expect(garden.variables).to.eql({
        a: "a",
        b: "B",
        c: "c",
      })
    })

    it("should load custom varfiles if specified", async () => {
      const projectRoot = join(dataDir, "test-projects", "varfiles-custom")
      const garden = await Garden.factory(projectRoot, {})
      expect(garden.variables).to.eql({
        a: "a",
        b: "B",
        c: "c",
      })
    })

    it("should throw if project root is not in a git repo root", async () => {
      const dir = await tmp.dir({ unsafeCleanup: true })

      try {
        const tmpPath = await realpath(dir.path)
        await writeFile(
          join(tmpPath, "garden.yml"),
          dedent`
          kind: Project
          name: foo
        `
        )
        await expectError(async () => Garden.factory(tmpPath, {}), "runtime")
      } finally {
        await dir.cleanup()
      }
    })
  })

  describe("getPlugins", () => {
    it("should attach base from createModuleTypes when overriding a handler via extendModuleTypes", async () => {
      const base = createGardenPlugin({
        name: "base",
        createModuleTypes: [
          {
            name: "foo",
            docs: "foo",
            schema: joi.object(),
            handlers: {
              build: async () => ({}),
            },
          },
        ],
      })
      const foo = createGardenPlugin({
        name: "foo",
        dependencies: ["base"],
        extendModuleTypes: [
          {
            name: "foo",
            handlers: {
              build: async () => ({}),
            },
          },
        ],
      })

      const garden = await Garden.factory(pathFoo, {
        plugins: [base, foo],
        config: {
          ...projectConfigFoo,
          providers: [...projectConfigFoo.providers, { name: "base" }],
        },
      })

      const parsed = await garden.getPlugin("foo")
      const extended = findByName(parsed.extendModuleTypes, "foo")!

      expect(extended).to.exist
      expect(extended.name).to.equal("foo")
      expect(extended.handlers.build).to.exist
      expect(extended.handlers.build!.base).to.exist
      expect(extended.handlers.build!.base!.actionType).to.equal("build")
      expect(extended.handlers.build!.base!.moduleType).to.equal("foo")
      expect(extended.handlers.build!.base!.pluginName).to.equal("base")
      expect(extended.handlers.build!.base!.base).to.not.exist
    })

    it("should throw if multiple plugins declare the same module type", async () => {
      const testPluginDupe = {
        ...testPlugin,
        name: "test-plugin-dupe",
      }
      const garden = await makeTestGardenA([testPluginDupe])

      garden["providerConfigs"].push({ name: "test-plugin-dupe" })

      await expectError(
        () => garden.getPlugins(),
        (err) =>
          expect(err.message).to.equal(
            "Module type 'test' is declared in multiple plugins: test-plugin, test-plugin-dupe."
          )
      )
    })

    it("should throw if a plugin extends a module type that hasn't been declared elsewhere", async () => {
      const foo = createGardenPlugin({
        name: "foo",
        extendModuleTypes: [
          {
            name: "bar",
            handlers: {},
          },
        ],
      })

      const garden = await Garden.factory(pathFoo, {
        plugins: [foo],
        config: projectConfigFoo,
      })

      await expectError(
        () => garden.getPlugins(),
        (err) =>
          expect(err.message).to.equal(deline`
          Plugin 'foo' extends module type 'bar' but the module type has not been declared.
          The 'foo' plugin is likely missing a dependency declaration.
          Please report an issue with the author.
        `)
      )
    })

    context("module type declaration has a base", () => {
      it("should allow recursive inheritance when defining module types", async () => {
        const baseA = createGardenPlugin({
          name: "base-a",
          createModuleTypes: [
            {
              name: "foo-a",
              title: "Foo A",
              docs: "foo-a",
              schema: baseModuleSpecSchema().keys({ foo: joi.string() }),
              moduleOutputsSchema: joi.object().keys({ moduleOutput: joi.string() }),
              handlers: {
                configure: async ({ moduleConfig }) => ({ moduleConfig }),
                getServiceStatus: async () => ({ state: <ServiceState>"ready", detail: {} }),
              },
            },
          ],
        })
        const baseB = createGardenPlugin({
          name: "base-b",
          dependencies: ["base-a"],
          createModuleTypes: [
            {
              name: "foo-b",
              base: "foo-a",
              docs: "Foo B",
              schema: baseModuleSpecSchema(),
              serviceOutputsSchema: joi.object().keys({ serviceOutput: joi.string() }),
              handlers: {
                build: async () => ({}),
              },
            },
          ],
        })
        const foo = createGardenPlugin({
          name: "foo",
          dependencies: ["base-b"],
          createModuleTypes: [
            {
              name: "foo-c",
              base: "foo-b",
              docs: "Foo C",
              taskOutputsSchema: baseModuleSpecSchema().keys({ taskOutput: joi.string() }),
              handlers: {
                configure: async ({ moduleConfig }) => ({ moduleConfig }),
                build: async () => ({}),
                getBuildStatus: async () => ({ ready: true }),
              },
            },
          ],
        })

        const garden = await Garden.factory(pathFoo, {
          plugins: [baseA, baseB, foo],
          config: projectConfigFoo,
        })

        const parsed = await garden.getPlugin("foo")
        const spec = findByName(parsed.createModuleTypes, "foo-c")!

        // Make sure properties are correctly inherited
        expect(spec).to.exist
        expect(spec.name).to.equal("foo-c")
        expect(spec.base).to.equal("foo-b")
        expect(spec.docs).to.equal("Foo C")
        expect(spec.title).to.not.exist
        expect(spec.schema).to.exist
        expect(spec.moduleOutputsSchema).to.not.exist
        expect(spec.serviceOutputsSchema).to.not.exist
        expect(spec.taskOutputsSchema).to.exist

        // Make sure handlers are correctly inherited and bases set
        const configureHandler = spec.handlers.configure!
        expect(configureHandler).to.exist
        expect(configureHandler.base).to.exist
        expect(configureHandler.base!.actionType).to.equal("configure")
        expect(configureHandler.base!.moduleType).to.equal("foo-a")
        expect(configureHandler.base!.pluginName).to.equal("base-a")
        expect(configureHandler.base!.base).to.not.exist

        const buildHandler = spec.handlers.build!
        expect(buildHandler).to.exist
        expect(buildHandler.base).to.exist
        expect(buildHandler.base!.actionType).to.equal("build")
        expect(buildHandler.base!.moduleType).to.equal("foo-b")
        expect(buildHandler.base!.pluginName).to.equal("base-b")
        expect(buildHandler.base!.base).to.not.exist

        const getBuildStatusHandler = spec.handlers.getBuildStatus!
        expect(getBuildStatusHandler).to.exist
        expect(getBuildStatusHandler.base).to.not.exist

        const getServiceStatusHandler = spec.handlers.getServiceStatus!
        expect(getServiceStatusHandler).to.not.exist
      })

      it("should throw when a module type has a base that is not defined", async () => {
        const foo = createGardenPlugin({
          name: "foo",
          createModuleTypes: [
            {
              name: "foo",
              docs: "foo",
              base: "bar",
              handlers: {},
            },
          ],
        })

        const garden = await Garden.factory(pathFoo, {
          plugins: [foo],
          config: projectConfigFoo,
        })

        await expectError(
          () => garden.getPlugins(),
          (err) =>
            expect(err.message).to.equal(deline`
            Module type 'foo', defined in plugin 'foo', specifies base module type 'bar' which cannot be found.
            The plugin is likely missing a dependency declaration. Please report an issue with the author.
          `)
        )
      })

      it("should throw when a module type has a base that is not declared in the plugin's dependencies", async () => {
        const base = createGardenPlugin({
          name: "base",
          createModuleTypes: [
            {
              name: "bar",
              docs: "bar",
              handlers: {},
            },
          ],
        })
        const foo = createGardenPlugin({
          name: "foo",
          createModuleTypes: [
            {
              name: "foo",
              docs: "foo",
              base: "bar",
              handlers: {},
            },
          ],
        })

        const garden = await Garden.factory(pathFoo, {
          plugins: [base, foo],
          config: {
            ...projectConfigFoo,
            providers: [...projectConfigFoo.providers, { name: "base" }],
          },
        })

        await expectError(
          () => garden.getPlugins(),
          (err) =>
            expect(err.message).to.equal(deline`
            Module type 'foo', defined in plugin 'foo', specifies base module type 'bar' which is defined by 'base'
            but 'foo' does not specify a dependency on that plugin. Plugins must explicitly declare dependencies on
            plugins that define module types they reference. Please report an issue with the author.
          `)
        )
      })

      it("should throw on circular module type base definitions", async () => {
        const foo = createGardenPlugin({
          name: "foo",
          createModuleTypes: [
            {
              name: "foo",
              docs: "foo",
              base: "bar",
              handlers: {},
            },
            {
              name: "bar",
              docs: "bar",
              base: "foo",
              handlers: {},
            },
          ],
        })

        const garden = await Garden.factory(pathFoo, {
          plugins: [foo],
          config: projectConfigFoo,
        })

        await expectError(
          () => garden.getPlugins(),
          (err) =>
            expect(err.message).to.equal(deline`
          Found circular dependency between module type bases (defined in plugin(s) 'foo'): foo -> bar -> foo
          `)
        )
      })
    })

    context("when a plugin has a base defined", () => {
      it("should add and deduplicate declared dependencies on top of the dependencies of the base", async () => {
        const depA = createGardenPlugin({
          name: "test-plugin",
          dependencies: [],
        })
        const depB = createGardenPlugin({
          name: "test-plugin-b",
          dependencies: [],
        })
        const depC = createGardenPlugin({
          name: "test-plugin-c",
          dependencies: [],
        })
        const base = createGardenPlugin({
          name: "base",
          dependencies: ["test-plugin", "test-plugin-b"],
        })
        const foo = createGardenPlugin({
          name: "foo",
          dependencies: ["test-plugin-b", "test-plugin-c"],
          base: "base",
        })

        const garden = await Garden.factory(pathFoo, {
          plugins: [depA, depB, depC, base, foo],
          config: projectConfigFoo,
        })

        const parsed = await garden.getPlugin("foo")

        expect(parsed.dependencies).to.eql(["test-plugin", "test-plugin-b", "test-plugin-c"])
      })

      it("should combine handlers from both plugins and attach base to the handler when overriding", async () => {
        const base = createGardenPlugin({
          name: "base",
          handlers: {
            configureProvider: async ({ config }) => ({ config }),
            getEnvironmentStatus: async () => ({ ready: true, outputs: {} }),
          },
        })
        const foo = createGardenPlugin({
          name: "foo",
          base: "base",
          handlers: {
            configureProvider: async ({ config }) => ({ config }),
          },
        })

        const garden = await Garden.factory(pathFoo, {
          plugins: [base, foo],
          config: projectConfigFoo,
        })

        const parsed = await garden.getPlugin("foo")

        expect(parsed.handlers.getEnvironmentStatus).to.equal(base.handlers.getEnvironmentStatus)
        expect(parsed.handlers.configureProvider!.base).to.equal(base.handlers.configureProvider)
        expect(parsed.handlers.configureProvider!.base!.actionType).to.equal("configureProvider")
        expect(parsed.handlers.configureProvider!.base!.pluginName).to.equal("base")
        expect(parsed.handlers.configureProvider!.base!.base).to.be.undefined
      })

      it("should inherit config schema from base, if none is specified", async () => {
        const base = createGardenPlugin({
          name: "base",
          configSchema: joi.object({ foo: joi.string().default("bar") }),
        })
        const foo = createGardenPlugin({
          name: "foo",
          base: "base",
        })

        const garden = await Garden.factory(pathFoo, {
          plugins: [base, foo],
          config: projectConfigFoo,
        })

        const parsed = await garden.getPlugin("foo")

        expect(parsed.configSchema).to.eql(base.configSchema)
      })

      it("should combine commands from both plugins and attach base handler when overriding", async () => {
        const base = createGardenPlugin({
          name: "base",
          commands: [
            {
              name: "foo",
              description: "foo",
              resolveModules: false,
              handler: () => ({ result: {} }),
            },
          ],
        })
        const foo = createGardenPlugin({
          name: "foo",
          base: "base",
          commands: [
            {
              name: "foo",
              description: "foo",
              handler: () => ({ result: {} }),
              resolveModules: false,
            },
            {
              name: "bar",
              description: "bar",
              handler: () => ({ result: {} }),
              resolveModules: false,
            },
          ],
        })

        const garden = await Garden.factory(pathFoo, {
          plugins: [base, foo],
          config: projectConfigFoo,
        })

        const parsed = await garden.getPlugin("foo")

        expect(parsed.commands!.length).to.equal(2)
        expect(findByName(parsed.commands!, "foo")).to.eql({
          ...foo.commands[0],
          base: base.commands[0],
        })
        expect(findByName(parsed.commands!, "bar")).to.eql(foo.commands[1])
      })

      it("should register module types from both plugins", async () => {
        const base = createGardenPlugin({
          name: "base",
          createModuleTypes: [
            {
              name: "foo",
              docs: "foo",
              schema: joi.object(),
              handlers: {},
            },
          ],
        })
        const foo = createGardenPlugin({
          name: "foo",
          base: "base",
          createModuleTypes: [
            {
              name: "bar",
              docs: "bar",
              schema: joi.object(),
              handlers: {},
            },
          ],
        })

        const garden = await Garden.factory(pathFoo, {
          plugins: [base, foo],
          config: projectConfigFoo,
        })

        const moduleTypes = await garden.getModuleTypes()

        expect(Object.keys(moduleTypes).sort()).to.eql(["bar", "container", "exec", "foo"])
      })

      it("should throw if attempting to redefine a module type defined in the base", async () => {
        const base = createGardenPlugin({
          name: "base",
          createModuleTypes: [
            {
              name: "foo",
              docs: "foo",
              schema: joi.object(),
              handlers: {},
            },
          ],
        })
        const foo = createGardenPlugin({
          name: "foo",
          base: "base",
          createModuleTypes: base.createModuleTypes,
        })

        const garden = await Garden.factory(pathFoo, {
          plugins: [base, foo],
          config: projectConfigFoo,
        })

        await expectError(
          () => garden.getPlugins(),
          (err) =>
            expect(err.message).to.equal("Plugin 'foo' redeclares the 'foo' module type, already declared by its base.")
        )
      })

      it("should allow extending a module type from the base", async () => {
        const base = createGardenPlugin({
          name: "base",
          createModuleTypes: [
            {
              name: "foo",
              docs: "foo",
              schema: joi.object(),
              handlers: {
                build: async () => ({}),
              },
            },
          ],
        })
        const foo = createGardenPlugin({
          name: "foo",
          base: "base",
          extendModuleTypes: [
            {
              name: "foo",
              handlers: {
                build: async () => ({}),
                getBuildStatus: async () => ({ ready: true }),
              },
            },
          ],
        })

        const garden = await Garden.factory(pathFoo, {
          plugins: [base, foo],
          config: projectConfigFoo,
        })

        const parsed = await garden.getPlugin("foo")
        const extended = findByName(parsed.extendModuleTypes, "foo")

        expect(extended).to.exist
        expect(extended!.name).to.equal("foo")
      })

      it("should only extend (and not also create) a module type if the base is also a configured plugin", async () => {
        const base = createGardenPlugin({
          name: "base",
          createModuleTypes: [
            {
              name: "foo",
              docs: "foo",
              schema: joi.object(),
              handlers: {
                build: async () => ({}),
              },
            },
          ],
        })
        const foo = createGardenPlugin({
          name: "foo",
          base: "base",
          extendModuleTypes: [
            {
              name: "foo",
              handlers: {
                build: async () => ({}),
                getBuildStatus: async () => ({ ready: true }),
              },
            },
          ],
        })

        const garden = await Garden.factory(pathFoo, {
          plugins: [base, foo],
          config: {
            ...projectConfigFoo,
            providers: [...projectConfigFoo.providers, { name: "base" }],
          },
        })

        const parsedFoo = await garden.getPlugin("foo")
        const parsedBase = await garden.getPlugin("base")

        expect(findByName(parsedBase.createModuleTypes, "foo")).to.exist
        expect(findByName(parsedFoo.createModuleTypes, "foo")).to.not.exist
        expect(findByName(parsedFoo.extendModuleTypes, "foo")).to.exist
      })

      it("should throw if the base plugin is not registered", async () => {
        const foo = createGardenPlugin({
          name: "foo",
          base: "base",
        })

        const garden = await Garden.factory(pathFoo, {
          plugins: [foo],
          config: projectConfigFoo,
        })

        await expectError(
          () => garden.getPlugins(),
          (err) =>
            expect(err.message).to.equal(
              "Plugin 'foo' specifies plugin 'base' as a base, but that plugin has not been registered."
            )
        )
      })

      it("should throw if plugins have circular bases", async () => {
        const foo = createGardenPlugin({
          name: "foo",
          base: "bar",
        })
        const bar = createGardenPlugin({
          name: "bar",
          base: "foo",
        })

        const garden = await Garden.factory(pathFoo, {
          plugins: [foo, bar],
          config: projectConfigFoo,
        })

        await expectError(
          () => garden.getPlugins(),
          (err) =>
            expect(err.message).to.equal("Found a circular dependency between registered plugins: foo -> bar -> foo")
        )
      })

      context("when a plugin's base has a base defined", () => {
        it("should add and deduplicate declared dependencies for the whole chain", async () => {
          const depA = createGardenPlugin({
            name: "test-plugin",
          })
          const depB = createGardenPlugin({
            name: "test-plugin-b",
          })
          const depC = createGardenPlugin({
            name: "test-plugin-c",
          })
          const baseA = createGardenPlugin({
            name: "base-a",
            dependencies: ["test-plugin"],
          })
          const b = createGardenPlugin({
            name: "b",
            dependencies: ["test-plugin", "test-plugin-b"],
            base: "base-a",
          })
          const foo = createGardenPlugin({
            name: "foo",
            dependencies: ["test-plugin-c"],
            base: "b",
          })

          const garden = await Garden.factory(pathFoo, {
            plugins: [depA, depB, depC, baseA, b, foo],
            config: projectConfigFoo,
          })

          const parsed = await garden.getPlugin("foo")

          expect(parsed.dependencies).to.eql(["test-plugin", "test-plugin-b", "test-plugin-c"])
        })

        it("should combine handlers from both plugins and recursively attach base handlers", async () => {
          const baseA = createGardenPlugin({
            name: "base-a",
            handlers: {
              configureProvider: async ({ config }) => ({ config }),
              getEnvironmentStatus: async () => ({ ready: true, outputs: {} }),
            },
          })
          const baseB = createGardenPlugin({
            name: "base-b",
            base: "base-a",
            handlers: {
              configureProvider: async ({ config }) => ({ config }),
            },
          })
          const foo = createGardenPlugin({
            name: "foo",
            base: "base-b",
            handlers: {
              configureProvider: async ({ config }) => ({ config }),
            },
          })

          const garden = await Garden.factory(pathFoo, {
            plugins: [baseA, baseB, foo],
            config: projectConfigFoo,
          })

          const parsed = await garden.getPlugin("foo")

          expect(parsed.handlers.getEnvironmentStatus).to.equal(baseA.handlers.getEnvironmentStatus)
          expect(parsed.handlers.configureProvider!.base).to.equal(baseB.handlers.configureProvider)
          expect(parsed.handlers.configureProvider!.base!.base).to.equal(baseA.handlers.configureProvider)
          expect(parsed.handlers.configureProvider!.base!.base!.base).to.be.undefined
        })

        it("should combine commands from all plugins and recursively set base handlers when overriding", async () => {
          const baseA = createGardenPlugin({
            name: "base-a",
            commands: [
              {
                name: "foo",
                description: "foo",
                handler: () => ({ result: {} }),
              },
            ],
          })
          const baseB = createGardenPlugin({
            name: "base-b",
            base: "base-a",
            commands: [
              {
                name: "foo",
                description: "foo",
                handler: () => ({ result: {} }),
              },
              {
                name: "bar",
                description: "bar",
                handler: () => ({ result: {} }),
              },
            ],
          })
          const foo = createGardenPlugin({
            name: "foo",
            base: "base-b",
            commands: [
              {
                name: "foo",
                description: "foo",
                handler: () => ({ result: {} }),
              },
              {
                name: "bar",
                description: "bar",
                handler: () => ({ result: {} }),
              },
            ],
          })

          const garden = await Garden.factory(pathFoo, {
            plugins: [baseA, baseB, foo],
            config: projectConfigFoo,
          })

          const parsed = await garden.getPlugin("foo")

          expect(parsed.commands!.length).to.equal(2)

          const fooCommand = findByName(parsed.commands!, "foo")!
          const barCommand = findByName(parsed.commands!, "bar")!

          expect(fooCommand).to.exist
          expect(fooCommand.handler).to.equal(foo.commands[0].handler)
          expect(fooCommand.base).to.exist
          expect(fooCommand.base!.handler).to.equal(baseB.commands[0].handler)
          expect(fooCommand.base!.base).to.exist
          expect(fooCommand.base!.base!.handler).to.equal(baseA.commands[0].handler)
          expect(fooCommand.base!.base!.base).to.be.undefined

          expect(barCommand).to.exist
          expect(barCommand!.handler).to.equal(foo.commands[1].handler)
          expect(barCommand!.base).to.exist
          expect(barCommand!.base!.handler).to.equal(baseB.commands[1].handler)
          expect(barCommand!.base!.base).to.be.undefined
        })

        it("should register defined module types from all plugins in the chain", async () => {
          const baseA = createGardenPlugin({
            name: "base-a",
            createModuleTypes: [
              {
                name: "a",
                docs: "foo",
                schema: joi.object(),
                handlers: {},
              },
            ],
          })
          const baseB = createGardenPlugin({
            name: "base-b",
            base: "base-a",
            createModuleTypes: [
              {
                name: "b",
                docs: "foo",
                schema: joi.object(),
                handlers: {},
              },
            ],
          })
          const foo = createGardenPlugin({
            name: "foo",
            base: "base-b",
            createModuleTypes: [
              {
                name: "c",
                docs: "bar",
                schema: joi.object(),
                handlers: {},
              },
            ],
          })

          const garden = await Garden.factory(pathFoo, {
            plugins: [baseA, baseB, foo],
            config: projectConfigFoo,
          })

          const moduleTypes = await garden.getModuleTypes()

          expect(Object.keys(moduleTypes).sort()).to.eql(["a", "b", "c", "container", "exec"])
        })

        it("should throw if attempting to redefine a module type defined in the base's base", async () => {
          const baseA = createGardenPlugin({
            name: "base-a",
            createModuleTypes: [
              {
                name: "foo",
                docs: "foo",
                schema: joi.object(),
                handlers: {},
              },
            ],
          })
          const baseB = createGardenPlugin({
            name: "base-b",
            base: "base-a",
            createModuleTypes: [],
          })
          const foo = createGardenPlugin({
            name: "foo",
            base: "base-b",
            createModuleTypes: [
              {
                name: "foo",
                docs: "foo",
                schema: joi.object(),
                handlers: {},
              },
            ],
          })

          const garden = await Garden.factory(pathFoo, {
            plugins: [baseA, baseB, foo],
            config: projectConfigFoo,
          })

          await expectError(
            () => garden.getPlugins(),
            (err) =>
              expect(err.message).to.equal(
                "Plugin 'foo' redeclares the 'foo' module type, already declared by its base."
              )
          )
        })

        it("should allow extending module types from the base's base", async () => {
          const baseA = createGardenPlugin({
            name: "base-a",
            createModuleTypes: [
              {
                name: "foo",
                docs: "foo",
                schema: joi.object(),
                handlers: {
                  build: async () => ({}),
                },
              },
            ],
          })
          const baseB = createGardenPlugin({
            name: "base-b",
            base: "base-a",
          })
          const foo = createGardenPlugin({
            name: "foo",
            base: "base-b",
            extendModuleTypes: [
              {
                name: "foo",
                handlers: {
                  build: async () => ({}),
                  getBuildStatus: async () => ({ ready: true }),
                },
              },
            ],
          })

          const garden = await Garden.factory(pathFoo, {
            plugins: [baseA, baseB, foo],
            config: projectConfigFoo,
          })

          const parsed = await garden.getPlugin("foo")

          expect(findByName(parsed.extendModuleTypes, "foo")).to.exist
        })

        it("should coalesce module type extensions if base plugin is not configured", async () => {
          const baseA = createGardenPlugin({
            name: "base-a",
            createModuleTypes: [
              {
                name: "foo",
                docs: "foo",
                schema: joi.object(),
                handlers: {
                  build: async () => ({}),
                },
              },
            ],
          })
          const baseB = createGardenPlugin({
            name: "base-b",
            base: "base-a",
            dependencies: ["base-a"],
            extendModuleTypes: [
              {
                name: "foo",
                handlers: {
                  build: async () => ({}),
                },
              },
            ],
          })
          const baseC = createGardenPlugin({
            name: "base-c",
            base: "base-b",
            dependencies: ["base-a"],
            extendModuleTypes: [
              {
                name: "foo",
                handlers: {
                  build: async () => ({}),
                  getBuildStatus: async () => ({ ready: true }),
                },
              },
            ],
          })
          const foo = createGardenPlugin({
            name: "foo",
            base: "base-c",
          })

          const garden = await Garden.factory(pathFoo, {
            plugins: [baseA, baseB, baseC, foo],
            config: projectConfigFoo,
          })

          const parsed = await garden.getPlugin("foo")

          // Module type extensions should be a combination of base-b and base-c extensions
          const fooExtension = findByName(parsed.extendModuleTypes, "foo")!

          expect(fooExtension).to.exist
          expect(fooExtension.handlers.build).to.exist
          expect(fooExtension.handlers.getBuildStatus).to.exist
          expect(fooExtension.handlers.build!.base).to.exist
          expect(fooExtension.handlers.build!.base!.actionType).to.equal("build")
          expect(fooExtension.handlers.build!.base!.moduleType).to.equal("foo")
          expect(fooExtension.handlers.build!.base!.pluginName).to.equal("foo")
        })

        it("should throw if plugins have circular bases", async () => {
          const baseA = createGardenPlugin({
            name: "base-a",
            base: "foo",
          })
          const baseB = createGardenPlugin({
            name: "base-b",
            base: "base-a",
          })
          const foo = createGardenPlugin({
            name: "foo",
            base: "base-b",
          })

          const garden = await Garden.factory(pathFoo, {
            plugins: [baseA, baseB, foo],
            config: projectConfigFoo,
          })

          await expectError(
            () => garden.getPlugins(),
            (err) =>
              expect(err.message).to.equal(
                "Found a circular dependency between registered plugins: base-a -> foo -> base-b -> base-a"
              )
          )
        })
      })
    })
  })

  describe("resolveProviders", () => {
    it("should throw when plugins are missing", async () => {
      const garden = await Garden.factory(projectRootA)

      await expectError(
        () => garden.resolveProviders(),
        (err) => expect(err.message).to.equal("Configured provider 'test-plugin' has not been registered.")
      )
    })

    it("should pass through a basic provider config", async () => {
      const garden = await makeTestGardenA()
      const projectRoot = garden.projectRoot

      const testPluginProvider = {
        name: "test-plugin",
        config: {
          name: "test-plugin",
          environments: ["local"],
          path: projectRoot,
        },
        dependencies: [],
        moduleConfigs: [],
        status: {
          ready: true,
          outputs: {},
        },
      }

      expect(await garden.resolveProviders()).to.eql([
        emptyProvider(projectRoot, "exec"),
        emptyProvider(projectRoot, "container"),
        testPluginProvider,
        {
          name: "test-plugin-b",
          config: {
            name: "test-plugin-b",
            environments: ["local"],
            path: projectRoot,
          },
          dependencies: [testPluginProvider],
          moduleConfigs: [],
          status: {
            ready: true,
            outputs: {},
          },
        },
      ])
    })

    it("should call a configureProvider handler if applicable", async () => {
      const projectConfig: ProjectConfig = {
        apiVersion: "garden.io/v0",
        kind: "Project",
        name: "test",
        path: process.cwd(),
        defaultEnvironment: "default",
        dotIgnoreFiles: defaultDotIgnoreFiles,
        environments: [{ name: "default", variables: {} }],
        providers: [{ name: "test", foo: "bar" }],
        variables: {},
      }

      const test = createGardenPlugin({
        name: "test",
        handlers: {
          async configureProvider({ config }: ConfigureProviderParams) {
            expect(config).to.eql({
              name: "test",
              path: projectConfig.path,
              foo: "bar",
            })
            return { config: { ...config, foo: "bla" } }
          },
        },
      })

      const garden = await Garden.factory(projectConfig.path, {
        plugins: [test],
        config: projectConfig,
      })

      const provider = await garden.resolveProvider("test")

      expect(provider.config).to.eql({
        name: "test",
        path: projectConfig.path,
        foo: "bla",
      })
    })

    it("should give a readable error if provider configs have invalid template strings", async () => {
      const test = createGardenPlugin({
        name: "test",
      })

      const projectConfig: ProjectConfig = {
        apiVersion: "garden.io/v0",
        kind: "Project",
        name: "test",
        path: projectRootA,
        defaultEnvironment: "default",
        dotIgnoreFiles: defaultDotIgnoreFiles,
        environments: [{ name: "default", variables: {} }],
        providers: [{ name: "test", foo: "${bla.ble}" }],
        variables: {},
      }

      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins: [test] })
      await expectError(
        () => garden.resolveProviders(),
        (err) => {
          expect(err.message).to.equal("Failed resolving one or more providers:\n" + "- test")
          expect(stripAnsi(err.detail.messages[0])).to.equal(
            "- test: Invalid template string ${bla.ble}: Could not find key bla."
          )
        }
      )
    })

    it("should throw if providers reference non-existent providers in template strings", async () => {
      const test = createGardenPlugin({
        name: "test",
      })

      const projectConfig: ProjectConfig = {
        apiVersion: "garden.io/v0",
        kind: "Project",
        name: "test",
        path: projectRootA,
        defaultEnvironment: "default",
        dotIgnoreFiles: defaultDotIgnoreFiles,
        environments: [{ name: "default", variables: {} }],
        providers: [{ name: "test", foo: "${providers.foo.config.bla}" }],
        variables: {},
      }

      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins: [test] })
      await expectError(() => garden.resolveProviders())
    })

    it("should add plugin modules if returned by the provider", async () => {
      const pluginModule: ModuleConfig = {
        apiVersion: DEFAULT_API_VERSION,
        allowPublish: false,
        build: { dependencies: [] },
        disabled: false,
        name: "foo",
        outputs: {},
        path: "/tmp",
        serviceConfigs: [],
        taskConfigs: [],
        spec: {},
        testConfigs: [],
        type: "exec",
      }

      const test = createGardenPlugin({
        name: "test",
        handlers: {
          async configureProvider({ config }: ConfigureProviderParams) {
            return { config, moduleConfigs: [pluginModule] }
          },
        },
        createModuleTypes: [
          {
            name: "test",
            docs: "Test plugin",
            schema: joi.object(),
            handlers: {},
          },
        ],
      })

      const projectConfig: ProjectConfig = {
        apiVersion: "garden.io/v0",
        kind: "Project",
        name: "test",
        path: projectRootA,
        defaultEnvironment: "default",
        dotIgnoreFiles: defaultDotIgnoreFiles,
        environments: [{ name: "default", variables: {} }],
        providers: [{ name: "test", foo: "bar" }],
        variables: {},
      }

      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins: [test] })

      const graph = await garden.getConfigGraph(garden.log)
      expect(await graph.getModule("test--foo")).to.exist
    })

    it("should throw if plugins have declared circular dependencies", async () => {
      const testA = createGardenPlugin({
        name: "test-a",
        dependencies: ["test-b"],
      })

      const testB = createGardenPlugin({
        name: "test-b",
        dependencies: ["test-a"],
      })

      const projectConfig: ProjectConfig = {
        apiVersion: "garden.io/v0",
        kind: "Project",
        name: "test",
        path: projectRootA,
        defaultEnvironment: "default",
        dotIgnoreFiles: defaultDotIgnoreFiles,
        environments: [{ name: "default", variables: {} }],
        providers: [{ name: "test-a" }, { name: "test-b" }],
        variables: {},
      }

      const plugins = [testA, testB]
      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins })

      await expectError(
        () => garden.resolveProviders(),
        (err) =>
          expect(err.message).to.equal(
            "Found a circular dependency between registered plugins: test-a -> test-b -> test-a"
          )
      )
    })

    it("should throw if plugins reference themselves as dependencies", async () => {
      const testA = createGardenPlugin({
        name: "test-a",
        dependencies: ["test-a"],
      })

      const projectConfig: ProjectConfig = {
        apiVersion: "garden.io/v0",
        kind: "Project",
        name: "test",
        path: projectRootA,
        defaultEnvironment: "default",
        dotIgnoreFiles: defaultDotIgnoreFiles,
        environments: [{ name: "default", variables: {} }],
        providers: [{ name: "test-a" }],
        variables: {},
      }

      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins: [testA] })

      await expectError(
        () => garden.resolveProviders(),
        (err) =>
          expect(err.message).to.equal("Found a circular dependency between registered plugins: test-a -> test-a")
      )
    })

    it("should throw if provider configs have implicit circular dependencies", async () => {
      const testA = createGardenPlugin({
        name: "test-a",
      })
      const testB = createGardenPlugin({
        name: "test-b",
      })

      const projectConfig: ProjectConfig = {
        apiVersion: "garden.io/v0",
        kind: "Project",
        name: "test",
        path: projectRootA,
        defaultEnvironment: "default",
        dotIgnoreFiles: defaultDotIgnoreFiles,
        environments: [{ name: "default", variables: {} }],
        providers: [
          { name: "test-a", foo: "${providers.test-b.outputs.foo}" },
          { name: "test-b", foo: "${providers.test-a.outputs.foo}" },
        ],
        variables: {},
      }

      const plugins = [testA, testB]
      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins })

      await expectError(
        () => garden.resolveProviders(),
        (err) =>
          expect(err.message).to.equal(
            "One or more circular dependencies found between providers " +
              "or their configurations: test-a <- test-b <- test-a"
          )
      )
    })

    it("should throw if provider configs have combined implicit and declared circular dependencies", async () => {
      const testA = createGardenPlugin({
        name: "test-a",
      })

      const testB = createGardenPlugin({
        name: "test-b",
        dependencies: ["test-a"],
      })

      const projectConfig: ProjectConfig = {
        apiVersion: "garden.io/v0",
        kind: "Project",
        name: "test",
        path: projectRootA,
        defaultEnvironment: "default",
        dotIgnoreFiles: defaultDotIgnoreFiles,
        environments: [{ name: "default", variables: {} }],
        providers: [{ name: "test-a", foo: "${providers.test-b.outputs.foo}" }, { name: "test-b" }],
        variables: {},
      }

      const plugins = [testA, testB]
      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins })

      await expectError(
        () => garden.resolveProviders(),
        (err) =>
          expect(err.message).to.equal(
            "One or more circular dependencies found between providers " +
              "or their configurations: test-b <- test-a <- test-b"
          )
      )
    })

    it("should apply default values from a plugin's configuration schema if specified", async () => {
      const test = createGardenPlugin({
        name: "test",
        configSchema: providerConfigBaseSchema().keys({
          foo: joi.string().default("bar"),
        }),
      })

      const projectConfig: ProjectConfig = {
        apiVersion: "garden.io/v0",
        kind: "Project",
        name: "test",
        path: projectRootA,
        defaultEnvironment: "default",
        dotIgnoreFiles: defaultDotIgnoreFiles,
        environments: [{ name: "default", variables: {} }],
        providers: [{ name: "test" }],
        variables: {},
      }

      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins: [test] })
      const providers = keyBy(await garden.resolveProviders(), "name")

      expect(providers.test).to.exist
      expect(providers.test.config.foo).to.equal("bar")
    })

    it("should throw if a config doesn't match a plugin's configuration schema", async () => {
      const test = createGardenPlugin({
        name: "test",
        configSchema: providerConfigBaseSchema().keys({
          foo: joi.string(),
        }),
      })

      const projectConfig: ProjectConfig = {
        apiVersion: "garden.io/v0",
        kind: "Project",
        name: "test",
        path: projectRootA,
        defaultEnvironment: "default",
        dotIgnoreFiles: defaultDotIgnoreFiles,
        environments: [{ name: "default", variables: {} }],
        providers: [{ name: "test", foo: 123 }],
        variables: {},
      }

      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins: [test] })

      await expectError(
        () => garden.resolveProviders(),
        (err) => {
          expect(err.message).to.equal("Failed resolving one or more providers:\n" + "- test")
          expect(stripAnsi(err.detail.messages[0])).to.equal(
            "- test: Error validating provider configuration (/garden.yml): key .foo must be a string"
          )
        }
      )
    })

    it("should throw if configureProvider returns a config that doesn't match a plugin's config schema", async () => {
      const test = createGardenPlugin({
        name: "test",
        configSchema: providerConfigBaseSchema().keys({
          foo: joi.string(),
        }),
        handlers: {
          configureProvider: async () => ({
            config: { name: "test", foo: 123 },
          }),
        },
      })

      const projectConfig: ProjectConfig = {
        apiVersion: "garden.io/v0",
        kind: "Project",
        name: "test",
        path: projectRootA,
        defaultEnvironment: "default",
        dotIgnoreFiles: defaultDotIgnoreFiles,
        environments: [{ name: "default", variables: {} }],
        providers: [{ name: "test" }],
        variables: {},
      }

      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins: [test] })

      await expectError(
        () => garden.resolveProviders(),
        (err) => {
          expect(err.message).to.equal("Failed resolving one or more providers:\n" + "- test")
          expect(stripAnsi(err.detail.messages[0])).to.equal(
            "- test: Error validating provider configuration (/garden.yml): key .foo must be a string"
          )
        }
      )
    })

    it("should allow providers to reference each others' outputs", async () => {
      const testA = createGardenPlugin({
        name: "test-a",
        handlers: {
          getEnvironmentStatus: async () => {
            return {
              ready: true,
              outputs: { foo: "bar" },
            }
          },
        },
      })

      const testB = createGardenPlugin({
        name: "test-b",
      })

      const projectConfig: ProjectConfig = {
        apiVersion: "garden.io/v0",
        kind: "Project",
        name: "test",
        path: projectRootA,
        defaultEnvironment: "default",
        dotIgnoreFiles: defaultDotIgnoreFiles,
        environments: [{ name: "default", variables: {} }],
        providers: [{ name: "test-a" }, { name: "test-b", foo: "${providers.test-a.outputs.foo}" }],
        variables: {},
      }

      const plugins = [testA, testB]
      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins })

      const providerB = await garden.resolveProvider("test-b")

      expect(providerB.config.foo).to.equal("bar")
    })

    it("should allow providers to reference outputs from a disabled provider", async () => {
      const testA = createGardenPlugin({
        name: "test-a",
        handlers: {
          getEnvironmentStatus: async () => {
            return {
              ready: true,
              outputs: { foo: "bar" },
            }
          },
        },
      })

      const testB = createGardenPlugin({
        name: "test-b",
      })

      const projectConfig: ProjectConfig = {
        apiVersion: "garden.io/v0",
        kind: "Project",
        name: "test",
        path: projectRootA,
        defaultEnvironment: "dev",
        dotIgnoreFiles: defaultDotIgnoreFiles,
        environments: [
          { name: "dev", variables: {} },
          { name: "prod", variables: {} },
        ],
        providers: [
          { name: "test-a", environments: ["prod"] },
          { name: "test-b", foo: "${providers.test-a.outputs.foo || 'default'}" },
        ],
        variables: {},
      }

      const plugins = [testA, testB]
      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins })

      const providerB = await garden.resolveProvider("test-b")

      expect(providerB.config.foo).to.equal("default")
    })

    it("should allow providers to reference variables", async () => {
      const testA = createGardenPlugin({
        name: "test-a",
      })

      const projectConfig: ProjectConfig = {
        apiVersion: "garden.io/v0",
        kind: "Project",
        name: "test",
        path: projectRootA,
        defaultEnvironment: "default",
        dotIgnoreFiles: defaultDotIgnoreFiles,
        environments: [{ name: "default", variables: { "my-variable": "bar" } }],
        providers: [{ name: "test-a", foo: "${var.my-variable}" }],
        variables: {},
      }

      const plugins = [testA]
      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins })

      const providerB = await garden.resolveProvider("test-a")

      expect(providerB.config.foo).to.equal("bar")
    })

    it("should match a dependency to a plugin base", async () => {
      const baseA = createGardenPlugin({
        name: "base-a",
        handlers: {
          getEnvironmentStatus: async () => {
            return {
              ready: true,
              outputs: { foo: "bar" },
            }
          },
        },
      })

      const testA = createGardenPlugin({
        name: "test-a",
        base: "base-a",
      })

      const testB = createGardenPlugin({
        name: "test-b",
        dependencies: ["base-a"],
      })

      const projectConfig: ProjectConfig = {
        apiVersion: "garden.io/v0",
        kind: "Project",
        name: "test",
        path: projectRootA,
        defaultEnvironment: "default",
        dotIgnoreFiles: defaultDotIgnoreFiles,
        environments: [{ name: "default", variables: {} }],
        providers: [{ name: "test-a" }, { name: "test-b" }],
        variables: {},
      }

      const plugins = [baseA, testA, testB]
      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins })

      const providerA = await garden.resolveProvider("test-a")
      const providerB = await garden.resolveProvider("test-b")

      expect(providerB.dependencies).to.eql([providerA])
    })

    it("should match a dependency to a plugin base that's declared by multiple plugins", async () => {
      const baseA = createGardenPlugin({
        name: "base-a",
        handlers: {
          getEnvironmentStatus: async () => {
            return {
              ready: true,
              outputs: { foo: "bar" },
            }
          },
        },
      })

      // test-a and test-b share one base
      const testA = createGardenPlugin({
        name: "test-a",
        base: "base-a",
      })

      const testB = createGardenPlugin({
        name: "test-b",
        base: "base-a",
      })

      const testC = createGardenPlugin({
        name: "test-c",
        dependencies: ["base-a"],
      })

      const projectConfig: ProjectConfig = {
        apiVersion: "garden.io/v0",
        kind: "Project",
        name: "test",
        path: projectRootA,
        defaultEnvironment: "default",
        dotIgnoreFiles: defaultDotIgnoreFiles,
        environments: [{ name: "default", variables: {} }],
        providers: [{ name: "test-a" }, { name: "test-b" }, { name: "test-c" }],
        variables: {},
      }

      const plugins = [baseA, testA, testB, testC]
      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins })

      const providerA = await garden.resolveProvider("test-a")
      const providerB = await garden.resolveProvider("test-b")
      const providerC = await garden.resolveProvider("test-c")

      expect(providerC.dependencies).to.eql([providerA, providerB])
    })

    context("when a plugin has a base", () => {
      it("should throw if the config for the plugin doesn't match the base's config schema", async () => {
        const base = createGardenPlugin({
          name: "base",
          configSchema: providerConfigBaseSchema().keys({
            foo: joi.string(),
          }),
        })

        const test = createGardenPlugin({
          name: "test",
          base: "base",
        })

        const projectConfig: ProjectConfig = {
          apiVersion: "garden.io/v0",
          kind: "Project",
          name: "test",
          path: projectRootA,
          defaultEnvironment: "default",
          dotIgnoreFiles: defaultDotIgnoreFiles,
          environments: [{ name: "default", variables: {} }],
          providers: [{ name: "test", foo: 123 }],
          variables: {},
        }

        const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins: [base, test] })

        await expectError(
          () => garden.resolveProviders(),
          (err) => {
            expect(err.message).to.equal("Failed resolving one or more providers:\n" + "- test")
            expect(stripAnsi(err.detail.messages[0])).to.equal(
              "- test: Error validating provider configuration (/garden.yml): key .foo must be a string"
            )
          }
        )
      })

      it("should throw if the configureProvider handler doesn't return a config matching the base", async () => {
        const base = createGardenPlugin({
          name: "base",
          configSchema: providerConfigBaseSchema().keys({
            foo: joi.string(),
          }),
        })

        const test = createGardenPlugin({
          name: "test",
          base: "base",
          configSchema: joi.object(),
          handlers: {
            configureProvider: async () => ({
              config: { name: "test", foo: 123 },
            }),
          },
        })

        const projectConfig: ProjectConfig = {
          apiVersion: "garden.io/v0",
          kind: "Project",
          name: "test",
          path: projectRootA,
          defaultEnvironment: "default",
          dotIgnoreFiles: defaultDotIgnoreFiles,
          environments: [{ name: "default", variables: {} }],
          providers: [{ name: "test" }],
          variables: {},
        }

        const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins: [base, test] })

        await expectError(
          () => garden.resolveProviders(),
          (err) => {
            expect(err.message).to.equal("Failed resolving one or more providers:\n" + "- test")
            expect(stripAnsi(err.detail.messages[0])).to.equal(
              "- test: Error validating provider configuration (base schema from 'base' plugin) " +
                "(/garden.yml): key .foo must be a string"
            )
          }
        )
      })
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
      expect(files).to.eql([join(garden.projectRoot, "module-a", "garden.yml")])
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

      const modules = await garden["resolveModuleConfigs"](garden.log)
      expect(getNames(modules).sort()).to.eql(["module-a", "module-b", "module-c"])
    })

    it("should scan and add modules for projects with configs defining multiple modules", async () => {
      const garden = await makeTestGarden(resolve(dataDir, "test-projects", "multiple-module-config"))
      await garden.scanModules()

      const modules = await garden["resolveModuleConfigs"](garden.log)
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
      const garden = await makeExtProjectSourcesGarden()
      await garden.scanModules()
      const modules = await garden["resolveModuleConfigs"](garden.log)
      expect(getNames(modules).sort()).to.eql(["module-a", "module-b", "module-c"])
    })

    it("should throw when two modules have the same name", async () => {
      const garden = await makeTestGarden(resolve(dataDir, "test-projects", "duplicate-module"))

      await expectError(
        () => garden.scanModules(),
        (err) =>
          expect(err.message).to.equal(
            "Module module-a is declared multiple times (in 'module-a/garden.yml' and 'module-b/garden.yml')"
          )
      )
    })

    it("should scan and add modules with config files with yaml and yml extensions", async () => {
      const garden = await makeTestGarden(getDataDir("test-project-yaml-file-extensions"))
      const modules = await garden["resolveModuleConfigs"](garden.log)
      expect(getNames(modules).sort()).to.eql(["module-yaml", "module-yml"])
    })

    it("should respect the modules.include and modules.exclude fields, if specified", async () => {
      const projectRoot = getDataDir("test-projects", "project-include-exclude")
      const garden = await makeTestGarden(projectRoot)
      const moduleConfigs = await garden["resolveModuleConfigs"](garden.log)

      // Should NOT include "nope" and "module-c"
      expect(getNames(moduleConfigs).sort()).to.eql(["module-a", "module-b"])
    })

    it("should respect .gitignore and .gardenignore files", async () => {
      const projectRoot = getDataDir("test-projects", "dotignore")
      const garden = await makeTestGarden(projectRoot)
      const moduleConfigs = await garden["resolveModuleConfigs"](garden.log)

      expect(getNames(moduleConfigs).sort()).to.eql(["module-a"])
    })

    it("should respect custom dotignore files", async () => {
      const projectRoot = getDataDir("test-projects", "dotignore")
      const garden = await makeTestGarden(projectRoot)
      const moduleConfigs = await garden["resolveModuleConfigs"](garden.log)

      expect(getNames(moduleConfigs).sort()).to.eql(["module-a"])
    })

    it("should throw a nice error if module paths overlap", async () => {
      const projectRoot = getDataDir("test-projects", "multiple-module-config-bad")
      const garden = await makeTestGarden(projectRoot)
      await expectError(
        () => garden["resolveModuleConfigs"](garden.log),
        (err) => {
          expect(stripAnsi(err.message)).to.equal(dedent`
          Missing include and/or exclude directives on modules with overlapping paths.
          Setting includes/excludes is required when modules have the same path (i.e. are in the same garden.yml file),
          or when one module is nested within another.

          Module module-no-include-a overlaps with module(s) module-a1 (nested), module-a2 (nested) and module-no-include-b (same path).

          Module module-no-include-b overlaps with module(s) module-a1 (nested), module-a2 (nested) and module-no-include-a (same path).
          `)
        }
      )
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
        () => garden["resolveModuleConfigs"](garden.log),
        (err) =>
          expect(err.message).to.equal(
            "Invalid template string ${modules.module-a.version}: " +
              "Circular reference detected when resolving key modules.module-a (from modules.module-a)"
          )
      )
    })

    it("should resolve module path to external sources dir if module has a remote source", async () => {
      const projectRoot = resolve(dataDir, "test-project-ext-module-sources")
      const garden = await makeExtModuleSourcesGarden()

      const module = await garden.resolveModuleConfig(garden.log, "module-a")

      expect(module!.path).to.equal(join(projectRoot, ".garden", "sources", "module", `module-a--${testGitUrlHash}`))
    })

    it("should handle template variables for non-string fields", async () => {
      const projectRoot = getDataDir("test-projects", "non-string-template-values")
      const garden = await makeTestGarden(projectRoot)

      const module = await garden.resolveModuleConfig(garden.log, "module-a")

      // We template in the value for the module's allowPublish field to test this
      expect(module.allowPublish).to.equal(false)
    })

    it("should handle module references within single file", async () => {
      const projectRoot = getDataDir("test-projects", "1067-module-ref-within-file")
      const garden = await makeTestGarden(projectRoot)
      // This should just complete successfully
      await garden["resolveModuleConfigs"](garden.log)
    })

    it("should throw if a module type is not recognized", async () => {
      const garden = await makeTestGardenA()
      const config = (await garden.getRawModuleConfigs(["module-a"]))[0]

      config.type = "foo"

      await expectError(
        () => garden["resolveModuleConfigs"](garden.log),
        (err) =>
          expect(err.message).to.equal(
            "Unrecognized module type 'foo' (defined at module-a/garden.yml). Are you missing a provider configuration?"
          )
      )
    })

    it("should throw if the module config doesn't match the declared schema", async () => {
      const foo = createGardenPlugin({
        name: "foo",
        createModuleTypes: [
          {
            name: "foo",
            docs: "foo",
            schema: joi.object().keys({ foo: joi.string() }),
            handlers: {},
          },
        ],
      })

      const garden = await Garden.factory(pathFoo, {
        plugins: [foo],
        config: projectConfigFoo,
      })

      garden["moduleConfigs"] = {
        foo: {
          apiVersion: DEFAULT_API_VERSION,
          name: "foo",
          type: "foo",
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          outputs: {},
          path: pathFoo,
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [],
          spec: { bla: "fla" },
        },
      }

      await expectError(
        () => garden["resolveModuleConfigs"](garden.log),
        (err) =>
          expect(stripAnsi(err.message)).to.equal(deline`
          Error validating module 'foo' (/garden.yml): key "bla" is not allowed at path [bla]
        `)
      )
    })

    it("should throw if the module outputs don't match the declared outputs schema", async () => {
      const foo = createGardenPlugin({
        name: "foo",
        createModuleTypes: [
          {
            name: "foo",
            docs: "foo",
            moduleOutputsSchema: joi.object().keys({ foo: joi.string() }),
            handlers: {
              configure: async ({ moduleConfig }) => ({
                moduleConfig: {
                  ...moduleConfig,
                  outputs: { foo: 123 },
                },
              }),
            },
          },
        ],
      })

      const garden = await Garden.factory(pathFoo, {
        plugins: [foo],
        config: projectConfigFoo,
      })

      garden["moduleConfigs"] = {
        foo: {
          apiVersion: DEFAULT_API_VERSION,
          name: "foo",
          type: "foo",
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          outputs: {},
          path: pathFoo,
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [],
          spec: {},
        },
      }

      await expectError(
        () => garden["resolveModuleConfigs"](garden.log),
        (err) =>
          expect(stripAnsi(err.message)).to.equal(deline`
          Error validating outputs for module 'foo' (/garden.yml): key .foo must be a string
        `)
      )
    })
  })

  context("module type has a base", () => {
    it("should throw if the configure handler output doesn't match the module type's base schema", async () => {
      const base = createGardenPlugin({
        name: "base",
        createModuleTypes: [
          {
            name: "base",
            docs: "base",
            schema: joi.object().keys({ base: joi.string().required() }),
            handlers: {},
          },
        ],
      })
      const foo = createGardenPlugin({
        name: "foo",
        dependencies: ["base"],
        createModuleTypes: [
          {
            name: "foo",
            base: "base",
            docs: "foo",
            schema: joi.object().keys({ foo: joi.string().required() }),
            handlers: {
              configure: async ({ moduleConfig }) => ({
                moduleConfig: {
                  ...moduleConfig,
                  spec: {
                    ...moduleConfig.spec,
                    foo: "bar",
                  },
                },
              }),
            },
          },
        ],
      })

      const garden = await Garden.factory(pathFoo, {
        plugins: [base, foo],
        config: {
          ...projectConfigFoo,
          providers: [...projectConfigFoo.providers, { name: "base" }],
        },
      })

      garden["moduleConfigs"] = {
        foo: {
          apiVersion: DEFAULT_API_VERSION,
          name: "foo",
          type: "foo",
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          outputs: {},
          path: pathFoo,
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [],
          spec: { foo: "bar" },
        },
      }

      await expectError(
        () => garden["resolveModuleConfigs"](garden.log),
        (err) =>
          expect(stripAnsi(err.message)).to.equal(deline`
          Error validating configuration for module 'foo'
          (base schema from 'base' plugin) (/garden.yml): key .base is required
        `)
      )
    })

    it("should throw if the module outputs don't match the base's declared outputs schema", async () => {
      const base = createGardenPlugin({
        name: "base",
        createModuleTypes: [
          {
            name: "base",
            docs: "base",
            moduleOutputsSchema: joi.object().keys({ foo: joi.string() }),
            handlers: {},
          },
        ],
      })
      const foo = createGardenPlugin({
        name: "foo",
        dependencies: ["base"],
        createModuleTypes: [
          {
            name: "foo",
            base: "base",
            docs: "foo",
            handlers: {
              configure: async ({ moduleConfig }) => ({
                moduleConfig: {
                  ...moduleConfig,
                  outputs: { foo: 123 },
                },
              }),
            },
          },
        ],
      })

      const garden = await Garden.factory(pathFoo, {
        plugins: [base, foo],
        config: {
          ...projectConfigFoo,
          providers: [...projectConfigFoo.providers, { name: "base" }],
        },
      })

      garden["moduleConfigs"] = {
        foo: {
          apiVersion: DEFAULT_API_VERSION,
          name: "foo",
          type: "foo",
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          outputs: {},
          path: pathFoo,
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [],
          spec: {},
        },
      }

      await expectError(
        () => garden["resolveModuleConfigs"](garden.log),
        (err) =>
          expect(stripAnsi(err.message)).to.equal(deline`
          Error validating outputs for module 'foo' (base schema from 'base' plugin) (/garden.yml):
          key .foo must be a string
        `)
      )
    })

    context("module type's base has a base", () => {
      it("should throw if the configure handler output doesn't match the schema of the base's base", async () => {
        const baseA = createGardenPlugin({
          name: "base-a",
          createModuleTypes: [
            {
              name: "base-a",
              docs: "base-a",
              schema: joi.object().keys({ base: joi.string().required() }),
              handlers: {},
            },
          ],
        })
        const baseB = createGardenPlugin({
          name: "base-b",
          dependencies: ["base-a"],
          createModuleTypes: [
            {
              name: "base-b",
              docs: "base-b",
              base: "base-a",
              schema: joi.object().keys({ foo: joi.string() }),
              handlers: {},
            },
          ],
        })
        const foo = createGardenPlugin({
          name: "foo",
          dependencies: ["base-b"],
          createModuleTypes: [
            {
              name: "foo",
              base: "base-b",
              docs: "foo",
              schema: joi.object().keys({ foo: joi.string().required() }),
              handlers: {
                configure: async ({ moduleConfig }) => ({
                  moduleConfig: {
                    ...moduleConfig,
                    spec: {
                      ...moduleConfig.spec,
                      foo: "bar",
                    },
                  },
                }),
              },
            },
          ],
        })

        const garden = await Garden.factory(pathFoo, {
          plugins: [baseA, baseB, foo],
          config: {
            ...projectConfigFoo,
            providers: [...projectConfigFoo.providers, { name: "base-a" }, { name: "base-b" }],
          },
        })

        garden["moduleConfigs"] = {
          foo: {
            apiVersion: DEFAULT_API_VERSION,
            name: "foo",
            type: "foo",
            allowPublish: false,
            build: { dependencies: [] },
            disabled: false,
            outputs: {},
            path: pathFoo,
            serviceConfigs: [],
            taskConfigs: [],
            testConfigs: [],
            spec: { foo: "bar" },
          },
        }

        await expectError(
          () => garden["resolveModuleConfigs"](garden.log),
          (err) =>
            expect(stripAnsi(err.message)).to.equal(deline`
            Error validating configuration for module 'foo'
            (base schema from 'base-a' plugin) (/garden.yml): key .base is required
          `)
        )
      })

      it("should throw if the module outputs don't match the base's base's declared outputs schema", async () => {
        const baseA = createGardenPlugin({
          name: "base-a",
          createModuleTypes: [
            {
              name: "base-a",
              docs: "base-a",
              moduleOutputsSchema: joi.object().keys({ foo: joi.string() }),
              handlers: {},
            },
          ],
        })
        const baseB = createGardenPlugin({
          name: "base-b",
          dependencies: ["base-a"],
          createModuleTypes: [
            {
              name: "base-b",
              docs: "base-b",
              base: "base-a",
              handlers: {},
            },
          ],
        })
        const foo = createGardenPlugin({
          name: "foo",
          dependencies: ["base-b"],
          createModuleTypes: [
            {
              name: "foo",
              base: "base-b",
              docs: "foo",
              handlers: {
                configure: async ({ moduleConfig }) => ({
                  moduleConfig: {
                    ...moduleConfig,
                    outputs: { foo: 123 },
                  },
                }),
              },
            },
          ],
        })

        const garden = await Garden.factory(pathFoo, {
          plugins: [baseA, baseB, foo],
          config: {
            ...projectConfigFoo,
            providers: [...projectConfigFoo.providers, { name: "base-a" }, { name: "base-b" }],
          },
        })

        garden["moduleConfigs"] = {
          foo: {
            apiVersion: DEFAULT_API_VERSION,
            name: "foo",
            type: "foo",
            allowPublish: false,
            build: { dependencies: [] },
            disabled: false,
            outputs: {},
            path: pathFoo,
            serviceConfigs: [],
            taskConfigs: [],
            testConfigs: [],
            spec: {},
          },
        }

        await expectError(
          () => garden["resolveModuleConfigs"](garden.log),
          (err) =>
            expect(stripAnsi(err.message)).to.equal(deline`
            Error validating outputs for module 'foo' (base schema from 'base-a' plugin) (/garden.yml):
            key .foo must be a string
          `)
        )
      })
    })

    context("when a provider has an augmentGraph handler", () => {
      it("should correctly add and resolve modules from the handler", async () => {
        const foo = createGardenPlugin({
          name: "foo",
          createModuleTypes: [
            {
              name: "foo",
              docs: "foo",
              schema: joi.object().keys({ foo: joi.string(), build: baseBuildSpecSchema() }),
              handlers: {
                configure: async ({ moduleConfig }) => {
                  return { moduleConfig }
                },
              },
            },
          ],
          handlers: {
            augmentGraph: async () => {
              return {
                addModules: [
                  {
                    kind: "Module",
                    type: "foo",
                    name: "foo",
                    foo: "bar",
                    path: "/tmp",
                  },
                ],
              }
            },
          },
        })

        const garden = await Garden.factory(pathFoo, {
          plugins: [foo],
          config: projectConfigFoo,
        })

        const moduleConfigs = await garden["resolveModuleConfigs"](garden.log)

        expect(deepOmitUndefined(moduleConfigs[0])).to.eql({
          apiVersion: "garden.io/v0",
          kind: "Module",
          allowPublish: true,
          build: { dependencies: [] },
          disabled: false,
          name: "foo",
          outputs: {},
          configPath: "/tmp",
          path: "/tmp",
          serviceConfigs: [],
          spec: { foo: "bar", build: { dependencies: [] } },
          testConfigs: [],
          type: "foo",
          taskConfigs: [],
        })
      })

      it("should apply returned build dependency relationships", async () => {
        const foo = createGardenPlugin({
          name: "foo",
          createModuleTypes: [
            {
              name: "foo",
              docs: "foo",
              schema: joi.object().keys({ foo: joi.string(), build: baseBuildSpecSchema() }),
              handlers: {
                configure: async ({ moduleConfig }) => {
                  return { moduleConfig }
                },
              },
            },
          ],
          handlers: {
            augmentGraph: async () => {
              return {
                addBuildDependencies: [{ by: "foo", on: "bar" }],
              }
            },
          },
        })

        const garden = await Garden.factory(pathFoo, {
          plugins: [foo],
          config: projectConfigFoo,
        })

        garden["moduleConfigs"] = {
          foo: {
            apiVersion: DEFAULT_API_VERSION,
            name: "foo",
            type: "foo",
            allowPublish: false,
            build: { dependencies: [] },
            disabled: false,
            outputs: {},
            path: "/tmp",
            include: [],
            serviceConfigs: [],
            taskConfigs: [],
            testConfigs: [],
            spec: {},
          },
          bar: {
            apiVersion: DEFAULT_API_VERSION,
            name: "bar",
            type: "foo",
            allowPublish: false,
            build: { dependencies: [] },
            disabled: false,
            outputs: {},
            path: "/tmp",
            include: [],
            serviceConfigs: [],
            taskConfigs: [],
            testConfigs: [],
            spec: {},
          },
        }

        const moduleConfigs = await garden["resolveModuleConfigs"](garden.log)
        const fooModule = deepOmitUndefined(findByName(moduleConfigs, "foo")!)

        expect(fooModule).to.eql({
          apiVersion: "garden.io/v0",
          kind: "Module",
          allowPublish: false,
          build: { dependencies: [{ name: "bar", copy: [] }] },
          disabled: false,
          name: "foo",
          outputs: {},
          path: "/tmp",
          include: [],
          serviceConfigs: [],
          spec: { build: { dependencies: [] } },
          testConfigs: [],
          type: "foo",
          taskConfigs: [],
        })
      })

      it("should add modules before applying dependencies", async () => {
        const foo = createGardenPlugin({
          name: "foo",
          createModuleTypes: [
            {
              name: "foo",
              docs: "foo",
              schema: joi.object().keys({ foo: joi.string(), build: baseBuildSpecSchema() }),
              handlers: {
                configure: async ({ moduleConfig }) => {
                  moduleConfig.include = []
                  moduleConfig.serviceConfigs = [
                    {
                      name: moduleConfig.name,
                    },
                  ]
                  return { moduleConfig }
                },
              },
            },
          ],
          handlers: {
            augmentGraph: async () => {
              return {
                addModules: [
                  {
                    kind: "Module",
                    type: "foo",
                    name: "foo",
                    foo: "bar",
                    path: "/tmp",
                  },
                  {
                    kind: "Module",
                    type: "foo",
                    name: "bar",
                    foo: "bar",
                    path: "/tmp",
                  },
                ],
                // These wouldn't work unless build deps are set in right order
                addBuildDependencies: [{ by: "foo", on: "bar" }],
                addRuntimeDependencies: [{ by: "foo", on: "bar" }],
              }
            },
          },
        })

        const garden = await Garden.factory(pathFoo, {
          plugins: [foo],
          config: projectConfigFoo,
        })

        const moduleConfigs = await garden["resolveModuleConfigs"](garden.log)
        const fooModule = deepOmitUndefined(findByName(moduleConfigs, "foo")!)

        expect(fooModule).to.eql({
          apiVersion: "garden.io/v0",
          kind: "Module",
          allowPublish: true,
          build: { dependencies: [{ name: "bar", copy: [] }] },
          disabled: false,
          name: "foo",
          outputs: {},
          configPath: "/tmp",
          path: "/tmp",
          include: [],
          serviceConfigs: [
            {
              name: "foo",
              dependencies: ["bar"],
              disabled: false,
              hotReloadable: false,
            },
          ],
          spec: { foo: "bar", build: { dependencies: [] } },
          testConfigs: [],
          type: "foo",
          taskConfigs: [],
        })
      })

      // TODO: Complete this once we've gotten rid of the <plugin-name>--<module-name> prefix business
      it.skip("should flag added modules as added by the plugin", async () => {
        throw "TODO"
      })

      it("should throw if a build dependency's `by` reference can't be resolved", async () => {
        const foo = createGardenPlugin({
          name: "foo",
          createModuleTypes: [
            {
              name: "foo",
              docs: "foo",
              schema: joi.object().keys({ foo: joi.string(), build: baseBuildSpecSchema() }),
              handlers: {
                configure: async ({ moduleConfig }) => {
                  return { moduleConfig }
                },
              },
            },
          ],
          handlers: {
            augmentGraph: async () => {
              return {
                addBuildDependencies: [{ by: "foo", on: "bar" }],
              }
            },
          },
        })

        const garden = await Garden.factory(pathFoo, {
          plugins: [foo],
          config: projectConfigFoo,
        })

        await expectError(
          () => garden["resolveModuleConfigs"](garden.log),
          (err) =>
            expect(stripAnsi(err.message)).to.equal(deline`
              Provider 'foo' added a build dependency by module 'foo' on 'bar' but module 'foo' could not be found.
            `)
        )
      })

      it("should apply returned runtime dependency relationships", async () => {
        const foo = createGardenPlugin({
          name: "foo",
          createModuleTypes: [
            {
              name: "foo",
              docs: "foo",
              schema: joi.object().keys({ foo: joi.string(), build: baseBuildSpecSchema() }),
              handlers: {
                configure: async ({ moduleConfig }) => {
                  moduleConfig.include = []
                  moduleConfig.serviceConfigs = [
                    {
                      name: moduleConfig.name,
                    },
                  ]
                  return { moduleConfig }
                },
              },
            },
          ],
          handlers: {
            augmentGraph: async () => {
              return {
                addRuntimeDependencies: [{ by: "foo", on: "bar" }],
              }
            },
          },
        })

        const garden = await Garden.factory(pathFoo, {
          plugins: [foo],
          config: projectConfigFoo,
        })

        garden["moduleConfigs"] = {
          foo: {
            apiVersion: DEFAULT_API_VERSION,
            name: "foo",
            type: "foo",
            allowPublish: false,
            build: { dependencies: [] },
            disabled: false,
            outputs: {},
            path: "/tmp",
            serviceConfigs: [],
            taskConfigs: [],
            testConfigs: [],
            spec: {},
          },
          bar: {
            apiVersion: DEFAULT_API_VERSION,
            name: "bar",
            type: "foo",
            allowPublish: false,
            build: { dependencies: [] },
            disabled: false,
            outputs: {},
            path: "/tmp",
            serviceConfigs: [],
            taskConfigs: [],
            testConfigs: [],
            spec: {},
          },
        }

        const moduleConfigs = await garden["resolveModuleConfigs"](garden.log)
        const fooModule = deepOmitUndefined(findByName(moduleConfigs, "foo")!)

        expect(fooModule).to.eql({
          apiVersion: "garden.io/v0",
          kind: "Module",
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          name: "foo",
          outputs: {},
          path: "/tmp",
          include: [],
          serviceConfigs: [
            {
              name: "foo",
              dependencies: ["bar"],
              disabled: false,
              hotReloadable: false,
            },
          ],
          spec: { build: { dependencies: [] } },
          testConfigs: [],
          type: "foo",
          taskConfigs: [],
        })
      })

      it("should throw if a runtime dependency's `by` reference can't be resolved", async () => {
        const foo = createGardenPlugin({
          name: "foo",
          createModuleTypes: [
            {
              name: "foo",
              docs: "foo",
              schema: joi.object().keys({ foo: joi.string(), build: baseBuildSpecSchema() }),
              handlers: {
                configure: async ({ moduleConfig }) => {
                  moduleConfig.serviceConfigs = [
                    {
                      name: moduleConfig.name,
                    },
                  ]
                  return { moduleConfig }
                },
              },
            },
          ],
          handlers: {
            augmentGraph: async () => {
              return {
                addRuntimeDependencies: [{ by: "bar", on: "foo" }],
              }
            },
          },
        })

        const garden = await Garden.factory(pathFoo, {
          plugins: [foo],
          config: projectConfigFoo,
        })

        garden["moduleConfigs"] = {
          foo: {
            apiVersion: DEFAULT_API_VERSION,
            name: "foo",
            type: "foo",
            allowPublish: false,
            build: { dependencies: [] },
            disabled: false,
            outputs: {},
            path: "/tmp",
            serviceConfigs: [],
            taskConfigs: [],
            testConfigs: [],
            spec: {},
          },
        }

        await expectError(
          () => garden["resolveModuleConfigs"](garden.log),
          (err) =>
            expect(stripAnsi(err.message)).to.equal(deline`
              Provider 'foo' added a runtime dependency by 'bar' on 'foo'
              but service or task 'bar' could not be found.
            `)
        )
      })

      it("should process augmentGraph handlers in dependency order", async () => {
        // Ensure modules added by the dependency are in place before adding dependencies in dependant.
        const foo = createGardenPlugin({
          name: "foo",
          dependencies: <string[]>[],
          createModuleTypes: [
            {
              name: "foo",
              docs: "foo",
              schema: joi.object().keys({ foo: joi.string(), build: baseBuildSpecSchema() }),
              handlers: {
                configure: async ({ moduleConfig }) => {
                  return { moduleConfig }
                },
              },
            },
          ],
          handlers: {
            augmentGraph: async () => {
              return {
                addModules: [
                  {
                    kind: "Module",
                    type: "foo",
                    name: "foo",
                    foo: "bar",
                    path: "/tmp",
                  },
                ],
              }
            },
          },
        })

        const bar = createGardenPlugin({
          name: "bar",
          dependencies: ["foo"],
          handlers: {
            augmentGraph: async () => {
              return {
                // This doesn't work unless providers are processed in right order
                addBuildDependencies: [{ by: "foo", on: "bar" }],
              }
            },
          },
        })

        const config = {
          ...projectConfigFoo,
          providers: [...projectConfigFoo.providers, { name: "bar" }],
        }

        // First test correct order
        let garden = await Garden.factory(pathFoo, {
          plugins: [foo, bar],
          config,
        })

        const moduleConfigs = await garden["resolveModuleConfigs"](garden.log)
        const fooModule = deepOmitUndefined(findByName(moduleConfigs, "foo")!)

        expect(fooModule).to.eql({
          apiVersion: "garden.io/v0",
          kind: "Module",
          allowPublish: true,
          build: { dependencies: [{ name: "bar", copy: [] }] },
          disabled: false,
          name: "foo",
          outputs: {},
          configPath: "/tmp",
          path: "/tmp",
          serviceConfigs: [],
          spec: { foo: "bar", build: { dependencies: [] } },
          testConfigs: [],
          type: "foo",
          taskConfigs: [],
        })

        // Then test wrong order and make sure it throws
        foo.dependencies = ["bar"]
        bar.dependencies = []

        garden = await Garden.factory(pathFoo, {
          plugins: [foo, bar],
          config,
        })

        await expectError(
          () => garden["resolveModuleConfigs"](garden.log),
          (err) =>
            expect(stripAnsi(err.message)).to.equal(deline`
              Provider 'bar' added a build dependency by module 'foo' on 'bar' but module 'foo' could not be found.
            `)
        )
      })
    })
  })

  describe("resolveVersion", () => {
    beforeEach(() => td.reset())

    it("should return result from cache if available", async () => {
      const garden = await makeTestGardenA()
      const config = await garden.resolveModuleConfig(garden.log, "module-a")
      const version: ModuleVersion = {
        versionString: "banana",
        dependencyVersions: {},
        files: [],
      }
      garden.cache.set(["moduleVersions", config.name], version, getModuleCacheContext(config))

      const result = await garden.resolveVersion(config, [])

      expect(result).to.eql(version)
    })

    it("should otherwise return version from VCS handler", async () => {
      const garden = await makeTestGardenA()
      await garden.scanModules()

      garden.cache.delete(["moduleVersions", "module-b"])

      const config = await garden.resolveModuleConfig(garden.log, "module-b")
      const resolveStub = td.replace(garden.vcs, "resolveVersion")
      const version: ModuleVersion = {
        versionString: "banana",
        dependencyVersions: {},
        files: [],
      }

      td.when(resolveStub(), { ignoreExtraArgs: true }).thenResolve(version)

      const result = await garden.resolveVersion(config, [])

      expect(result).to.eql(version)
    })

    it("should ignore cache if force=true", async () => {
      const garden = await makeTestGardenA()
      const config = await garden.resolveModuleConfig(garden.log, "module-a")
      const version: ModuleVersion = {
        versionString: "banana",
        dependencyVersions: {},
        files: [],
      }
      garden.cache.set(["moduleVersions", config.name], version, getModuleCacheContext(config))

      const result = await garden.resolveVersion(config, [], true)

      expect(result).to.not.eql(version)
    })

    context("test against fixed version hashes", async () => {
      const moduleAVersionString = "v-4b68c1fda7"
      const moduleBVersionString = "v-e145423c6c"
      const moduleCVersionString = "v-73c52d0676"

      it("should return the same module versions between runtimes", async () => {
        const projectRoot = getDataDir("test-projects", "fixed-version-hashes-1")

        process.env.MODULE_A_TEST_ENV_VAR = "foo"

        const garden = await makeTestGarden(projectRoot)
        const graph = await garden.getConfigGraph(garden.log)
        const moduleA = await graph.getModule("module-a")
        const moduleB = await graph.getModule("module-b")
        const moduleC = await graph.getModule("module-c")
        expect(moduleA.version.versionString).to.equal(moduleAVersionString)
        expect(moduleB.version.versionString).to.equal(moduleBVersionString)
        expect(moduleC.version.versionString).to.equal(moduleCVersionString)

        delete process.env.TEST_ENV_VAR
      })

      it("should return the same module versions for identiclal modules in different projects", async () => {
        const projectRoot = getDataDir("test-projects", "fixed-version-hashes-2")

        process.env.MODULE_A_TEST_ENV_VAR = "foo"

        const garden = await makeTestGarden(projectRoot)
        const graph = await garden.getConfigGraph(garden.log)
        const moduleA = await graph.getModule("module-a")
        const moduleB = await graph.getModule("module-b")
        const moduleC = await graph.getModule("module-c")
        expect(moduleA.version.versionString).to.equal(moduleAVersionString)
        expect(moduleB.version.versionString).to.equal(moduleBVersionString)
        expect(moduleC.version.versionString).to.equal(moduleCVersionString)

        delete process.env.MODULE_A_TEST_ENV_VAR
      })

      it("should not return the same module versions if templated variables change", async () => {
        const projectRoot = getDataDir("test-projects", "fixed-version-hashes-1")

        process.env.MODULE_A_TEST_ENV_VAR = "bar"

        const garden = await makeTestGarden(projectRoot)
        const graph = await garden.getConfigGraph(garden.log)
        const moduleA = await graph.getModule("module-a")
        const moduleB = await graph.getModule("module-b")
        const moduleC = await graph.getModule("module-c")
        expect(moduleA.version.versionString).to.not.equal(moduleAVersionString)
        expect(moduleB.version.versionString).to.equal(moduleBVersionString)
        expect(moduleC.version.versionString).to.equal(moduleCVersionString)

        delete process.env.MODULE_A_TEST_ENV_VAR
      })
    })
  })

  describe("loadExtSourcePath", () => {
    let garden: TestGarden

    context("external project sources", () => {
      before(async () => {
        garden = await makeExtProjectSourcesGarden()
      })

      afterEach(async () => {
        await resetLocalConfig(garden.gardenDirPath)
      })

      it("should return the path to the project source if source type is project", async () => {
        const projectRoot = getDataDir("test-project-ext-project-sources")
        const path = await garden.loadExtSourcePath({
          repositoryUrl: testGitUrl,
          name: "source-a",
          sourceType: "project",
        })
        expect(path).to.equal(join(projectRoot, ".garden", "sources", "project", `source-a--${testGitUrlHash}`))
      })

      it("should return the local path of the project source if linked", async () => {
        const localProjectSourceDir = getDataDir("test-project-local-project-sources")
        const linkedSourcePath = join(localProjectSourceDir, "source-a")

        const linked: LinkedSource[] = [
          {
            name: "source-a",
            path: linkedSourcePath,
          },
        ]
        await garden.configStore.set(["linkedProjectSources"], linked)

        const path = await garden.loadExtSourcePath({
          name: "source-a",
          repositoryUrl: testGitUrl,
          sourceType: "project",
        })

        expect(path).to.equal(linkedSourcePath)
      })
    })

    context("external module sources", () => {
      before(async () => {
        garden = await makeExtModuleSourcesGarden()
      })

      afterEach(async () => {
        await resetLocalConfig(garden.gardenDirPath)
      })

      it("should return the path to the module source if source type is module", async () => {
        const projectRoot = getDataDir("test-project-ext-module-sources")
        const path = await garden.loadExtSourcePath({
          repositoryUrl: testGitUrl,
          name: "module-a",
          sourceType: "module",
        })
        expect(path).to.equal(join(projectRoot, ".garden", "sources", "module", `module-a--${testGitUrlHash}`))
      })

      it("should return the local path of the module source if linked", async () => {
        const localModuleSourceDir = getDataDir("test-project-local-module-sources")
        const linkedModulePath = join(localModuleSourceDir, "module-a")

        const linked: LinkedSource[] = [
          {
            name: "module-a",
            path: linkedModulePath,
          },
        ]
        await garden.configStore.set(["linkedModuleSources"], linked)

        const path = await garden.loadExtSourcePath({
          name: "module-a",
          repositoryUrl: testGitUrl,
          sourceType: "module",
        })

        expect(path).to.equal(linkedModulePath)
      })
    })
  })
})

function emptyProvider(projectRoot: string, name: string) {
  return {
    name,
    config: {
      name,
      path: projectRoot,
    },
    dependencies: [],
    moduleConfigs: [],
    status: {
      ready: true,
      outputs: {},
    },
  }
}
