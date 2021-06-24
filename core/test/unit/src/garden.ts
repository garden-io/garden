/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
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
import { getNames, findByName, omitUndefined, exec } from "../../../src/util/util"
import { LinkedSource } from "../../../src/config-store"
import { ModuleVersion } from "../../../src/vcs/vcs"
import { getModuleCacheContext } from "../../../src/types/module"
import { createGardenPlugin } from "../../../src/types/plugin/plugin"
import { ConfigureProviderParams } from "../../../src/types/plugin/provider/configureProvider"
import { ProjectConfig, defaultNamespace } from "../../../src/config/project"
import { ModuleConfig, baseModuleSpecSchema, baseBuildSpecSchema } from "../../../src/config/module"
import { DEFAULT_API_VERSION } from "../../../src/constants"
import { providerConfigBaseSchema } from "../../../src/config/provider"
import { keyBy, set, mapValues } from "lodash"
import stripAnsi from "strip-ansi"
import { joi } from "../../../src/config/common"
import { defaultDotIgnoreFiles, makeTempDir } from "../../../src/util/fs"
import { realpath, writeFile, readFile, remove, pathExists, mkdirp, copy } from "fs-extra"
import { dedent, deline, randomString } from "../../../src/util/string"
import { ServiceState } from "../../../src/types/service"
import execa from "execa"
import { getLinkedSources, addLinkedSources } from "../../../src/util/ext-source-util"
import { safeDump } from "js-yaml"

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
      environments: [{ name: "default", defaultNamespace, variables: {} }],
      providers: [{ name: "foo" }],
      variables: {},
    }
  })

  after(async () => {
    await tmpDir.cleanup()
  })

  beforeEach(async () => {
    td.replace(Garden.prototype, "resolveModuleVersion", async () => testModuleVersion)
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

    it("should parse and resolve the config from the project root", async () => {
      const garden = await makeTestGardenA()
      const projectRoot = garden.projectRoot

      const testPluginProvider = {
        name: "test-plugin",
        config: {
          name: "test-plugin",
          dependencies: [],
          environments: ["local"],
          path: projectRoot,
        },
        dependencies: {},
        moduleConfigs: [],
        status: {
          ready: true,
          outputs: {},
        },
      }

      expect(garden.projectName).to.equal("test-project-a")

      const providers = await garden.resolveProviders(garden.log)
      const configs = mapValues(providers, (p) => p.config)

      expect(configs).to.eql({
        "exec": {
          name: "exec",
          dependencies: [],
          path: projectRoot,
        },
        "container": {
          name: "container",
          dependencies: [],
          path: projectRoot,
        },
        "templated": {
          name: "templated",
          path: projectRoot,
        },
        "test-plugin": testPluginProvider.config,
        "test-plugin-b": {
          name: "test-plugin-b",
          dependencies: [],
          environments: ["local"],
          path: projectRoot,
        },
      })

      expect(garden.variables).to.eql({
        some: "variable",
      })
    })

    it("should load a project config in a custom-named config file", async () => {
      const projectRoot = getDataDir("test-projects", "custom-config-names")
      const garden = await makeTestGarden(projectRoot)
      expect(garden.projectRoot).to.equal(projectRoot)
    })

    it("should resolve templated env variables in project config", async () => {
      process.env.TEST_PROVIDER_TYPE = "test-plugin"
      process.env.TEST_VARIABLE = "banana"

      const projectRoot = join(dataDir, "test-project-templated")

      const garden = await makeTestGarden(projectRoot, { forceRefresh: true })

      delete process.env.TEST_PROVIDER_TYPE
      delete process.env.TEST_VARIABLE

      const providers = await garden.resolveProviders(garden.log)
      const configs = mapValues(providers, (p) => p.config)

      expect(configs).to.eql({
        "exec": {
          name: "exec",
          dependencies: [],
          path: projectRoot,
        },
        "container": {
          name: "container",
          dependencies: [],
          path: projectRoot,
        },
        "templated": {
          name: "templated",
          path: projectRoot,
        },
        "test-plugin": {
          name: "test-plugin",
          dependencies: [],
          path: projectRoot,
        },
      })

      expect(garden.variables).to.eql({
        "some": "banana",
        "service-a-build-command": "OK",
      })
    })

    it("should throw if the specified environment isn't configured", async () => {
      await expectError(async () => TestGarden.factory(projectRootA, { environmentName: "bla" }), "parameter")
    })

    it("should throw if environment starts with 'garden-'", async () => {
      await expectError(async () => TestGarden.factory(projectRootA, { environmentName: "garden-bla" }), "parameter")
    })

    it("should set .garden as the default cache dir", async () => {
      const projectRoot = join(dataDir, "test-project-empty")
      const garden = await TestGarden.factory(projectRoot, { plugins: [testPlugin] })
      expect(garden.gardenDirPath).to.eql(join(projectRoot, ".garden"))
    })

    it("should optionally set a custom cache dir relative to project root", async () => {
      const projectRoot = join(dataDir, "test-project-empty")
      const garden = await TestGarden.factory(projectRoot, {
        plugins: [testPlugin],
        gardenDirPath: "my/cache/dir",
      })
      expect(garden.gardenDirPath).to.eql(join(projectRoot, "my/cache/dir"))
    })

    it("should optionally set a custom cache dir with an absolute path", async () => {
      const projectRoot = join(dataDir, "test-project-empty")
      const gardenDirPath = join(dataDir, "test-garden-dir")
      const garden = await TestGarden.factory(projectRoot, {
        plugins: [testPlugin],
        gardenDirPath,
      })
      expect(garden.gardenDirPath).to.eql(gardenDirPath)
    })

    it("should load default varfiles if they exist", async () => {
      const projectRoot = join(dataDir, "test-projects", "varfiles")
      const garden = await TestGarden.factory(projectRoot, {})
      expect(garden.variables).to.eql({
        a: "a",
        b: "B",
        c: "c",
      })
    })

    it("should load custom varfiles if specified", async () => {
      const projectRoot = join(dataDir, "test-projects", "varfiles-custom")
      const garden = await TestGarden.factory(projectRoot, {})
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
        await expectError(async () => TestGarden.factory(tmpPath, {}), "runtime")
      } finally {
        await dir.cleanup()
      }
    })

    it("should set the namespace attribute, if specified", async () => {
      const projectRoot = join(dataDir, "test-project-empty")
      const garden = await TestGarden.factory(projectRoot, { plugins: [testPlugin], environmentName: "foo.local" })
      expect(garden.environmentName).to.equal("local")
      expect(garden.namespace).to.equal("foo")
    })

    it("should set the namespace attribute to the defaultNamespace, if applicable", async () => {
      const config: ProjectConfig = {
        apiVersion: DEFAULT_API_VERSION,
        kind: "Project",
        name: "test",
        path: pathFoo,
        defaultEnvironment: "default",
        dotIgnoreFiles: [],
        environments: [{ name: "default", defaultNamespace: "foo", variables: {} }],
        providers: [{ name: "foo" }],
        variables: {},
      }

      const garden = await TestGarden.factory(pathFoo, { config, environmentName: "default" })

      expect(garden.environmentName).to.equal("default")
      expect(garden.namespace).to.equal("foo")
    })

    it("should throw if a namespace is not specified and the specified environment requires namespacing", async () => {
      const config: ProjectConfig = {
        apiVersion: DEFAULT_API_VERSION,
        kind: "Project",
        name: "test",
        path: pathFoo,
        defaultEnvironment: "default",
        dotIgnoreFiles: [],
        environments: [{ name: "default", defaultNamespace: null, variables: {} }],
        providers: [{ name: "foo" }],
        variables: {},
      }

      await expectError(
        () => TestGarden.factory(pathFoo, { config, environmentName: "default" }),
        (err) =>
          expect(stripAnsi(err.message)).to.equal(
            `Environment default has defaultNamespace set to null, and no explicit namespace was specified. Please either set a defaultNamespace or explicitly set a namespace at runtime (e.g. --env=some-namespace.default).`
          )
      )
    })

    it("should optionally override project variables", async () => {
      const config: ProjectConfig = {
        apiVersion: DEFAULT_API_VERSION,
        kind: "Project",
        name: "test",
        path: pathFoo,
        defaultEnvironment: "default",
        dotIgnoreFiles: [],
        environments: [{ name: "default", defaultNamespace: "foo", variables: {} }],
        providers: [{ name: "foo" }],
        variables: { foo: "default", bar: "something" },
      }

      const garden = await TestGarden.factory(pathFoo, {
        config,
        environmentName: "default",
        variables: { foo: "override" },
      })

      expect(garden.variables).to.eql({ foo: "override", bar: "something" })
    })
  })

  describe("getAllPlugins", () => {
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

      const garden = await TestGarden.factory(pathFoo, {
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

    it("should throw if plugin module exports invalid name", async () => {
      const pluginPath = join(__dirname, "plugins", "invalid-name.js")
      const plugins = [pluginPath]
      const projectRoot = join(dataDir, "test-project-empty")
      const garden = await TestGarden.factory(projectRoot, { plugins })
      await expectError(
        () => garden.getAllPlugins(),
        (err) =>
          expect(stripAnsi(err.message)).to.equal(
            `Unable to load plugin: Error: Error validating plugin module "${pluginPath}": key .gardenPlugin must be of type object`
          )
      )
    })

    it("should throw if plugin module doesn't contain plugin", async () => {
      const pluginPath = join(__dirname, "plugins", "missing-plugin.js")
      const plugins = [pluginPath]
      const projectRoot = join(dataDir, "test-project-empty")
      const garden = await TestGarden.factory(projectRoot, { plugins })
      await expectError(
        () => garden.getAllPlugins(),
        (err) =>
          expect(stripAnsi(err.message)).to.equal(
            `Unable to load plugin: Error: Error validating plugin module "${pluginPath}": key .gardenPlugin is required`
          )
      )
    })

    it("should throw if multiple plugins declare the same module type", async () => {
      const testPluginDupe = {
        ...testPlugin(),
        name: "test-plugin-dupe",
      }
      const garden = await makeTestGardenA([testPluginDupe])

      garden["providerConfigs"].push({ name: "test-plugin-dupe" })

      await expectError(
        () => garden.getAllPlugins(),
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

      const garden = await TestGarden.factory(pathFoo, {
        plugins: [foo],
        config: projectConfigFoo,
      })

      await expectError(
        () => garden.getAllPlugins(),
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

        const garden = await TestGarden.factory(pathFoo, {
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

        const garden = await TestGarden.factory(pathFoo, {
          plugins: [foo],
          config: projectConfigFoo,
        })

        await expectError(
          () => garden.getAllPlugins(),
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

        const garden = await TestGarden.factory(pathFoo, {
          plugins: [base, foo],
          config: {
            ...projectConfigFoo,
            providers: [...projectConfigFoo.providers, { name: "base" }],
          },
        })

        await expectError(
          () => garden.getAllPlugins(),
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

        const garden = await TestGarden.factory(pathFoo, {
          plugins: [foo],
          config: projectConfigFoo,
        })

        await expectError(
          () => garden.getAllPlugins(),
          (err) =>
            expect(err.message).to.equal(deline`
          Found circular dependency between module type
          bases:\n\nfoo (from plugin foo) <- bar (from plugin foo) <- foo (from plugin foo)
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

        const garden = await TestGarden.factory(pathFoo, {
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

        const garden = await TestGarden.factory(pathFoo, {
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
          configSchema: joi.object().keys({ foo: joi.string().default("bar") }),
        })
        const foo = createGardenPlugin({
          name: "foo",
          base: "base",
        })

        const garden = await TestGarden.factory(pathFoo, {
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

        const garden = await TestGarden.factory(pathFoo, {
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

      it("should combine tools from both plugins, ignoring base tools when overriding", async () => {
        const base = createGardenPlugin({
          name: "base",
          tools: [
            {
              name: "base-tool",
              type: "binary",
              _includeInGardenImage: false,
              description: "Test",
              builds: [],
            },
            {
              name: "common-tool",
              type: "binary",
              _includeInGardenImage: false,
              description: "Base description",
              builds: [],
            },
          ],
        })
        const foo = createGardenPlugin({
          name: "foo",
          base: "base",
          tools: [
            {
              name: "common-tool",
              type: "library",
              _includeInGardenImage: false,
              description: "Different description",
              builds: [],
            },
            {
              name: "different-tool",
              type: "binary",
              _includeInGardenImage: false,
              description: "Test",
              builds: [],
            },
          ],
        })

        const garden = await TestGarden.factory(pathFoo, {
          plugins: [base, foo],
          config: projectConfigFoo,
        })

        const parsed = await garden.getPlugin("foo")

        expect(parsed.tools!.length).to.equal(3)
        expect(findByName(parsed.tools!, "base-tool")).to.eql({
          ...base.tools![0],
        })
        expect(findByName(parsed.tools!, "common-tool")).to.eql({
          ...foo.tools![0],
        })
        expect(findByName(parsed.tools!, "different-tool")).to.eql(foo.tools![1])
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

        const garden = await TestGarden.factory(pathFoo, {
          plugins: [base, foo],
          config: projectConfigFoo,
        })

        const moduleTypes = await garden.getModuleTypes()

        expect(Object.keys(moduleTypes).sort()).to.eql(["bar", "container", "exec", "foo", "templated"])
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

        const garden = await TestGarden.factory(pathFoo, {
          plugins: [base, foo],
          config: projectConfigFoo,
        })

        await expectError(
          () => garden.getAllPlugins(),
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

        const garden = await TestGarden.factory(pathFoo, {
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

        const garden = await TestGarden.factory(pathFoo, {
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

        const garden = await TestGarden.factory(pathFoo, {
          plugins: [foo],
          config: projectConfigFoo,
        })

        await expectError(
          () => garden.getAllPlugins(),
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

        const garden = await TestGarden.factory(pathFoo, {
          plugins: [foo, bar],
          config: projectConfigFoo,
        })

        await expectError(
          () => garden.getAllPlugins(),
          (err) =>
            expect(err.message).to.equal("Found a circular dependency between registered plugins:\n\nfoo <- bar <- foo")
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

          const garden = await TestGarden.factory(pathFoo, {
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

          const garden = await TestGarden.factory(pathFoo, {
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

          const garden = await TestGarden.factory(pathFoo, {
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

          const garden = await TestGarden.factory(pathFoo, {
            plugins: [baseA, baseB, foo],
            config: projectConfigFoo,
          })

          const moduleTypes = await garden.getModuleTypes()

          expect(Object.keys(moduleTypes).sort()).to.eql(["a", "b", "c", "container", "exec", "templated"])
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

          const garden = await TestGarden.factory(pathFoo, {
            plugins: [baseA, baseB, foo],
            config: projectConfigFoo,
          })

          await expectError(
            () => garden.getAllPlugins(),
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

          const garden = await TestGarden.factory(pathFoo, {
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

          const garden = await TestGarden.factory(pathFoo, {
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
          expect(fooExtension.handlers.build!.base!.pluginName).to.equal("base-a")
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

          const garden = await TestGarden.factory(pathFoo, {
            plugins: [baseA, baseB, foo],
            config: projectConfigFoo,
          })

          await expectError(
            () => garden.getAllPlugins(),
            (err) =>
              expect(err.message).to.equal(
                "Found a circular dependency between registered plugins:\n\nbase-a <- foo <- base-b <- base-a"
              )
          )
        })
      })
    })
  })

  describe("resolveProviders", () => {
    it("should throw when plugins are missing", async () => {
      const garden = await TestGarden.factory(projectRootA)

      await expectError(
        () => garden.resolveProviders(garden.log),
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
          dependencies: [],
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

      const providers = await garden.resolveProviders(garden.log)
      const configs = mapValues(providers, (p) => p.config)

      expect(configs["test-plugin"]).to.eql(testPluginProvider.config)
      expect(configs["test-plugin-b"]).to.eql({
        name: "test-plugin-b",
        dependencies: [],
        environments: ["local"],
        path: projectRoot,
      })
    })

    it("should call a configureProvider handler if applicable", async () => {
      const projectConfig: ProjectConfig = {
        apiVersion: "garden.io/v0",
        kind: "Project",
        name: "test",
        path: process.cwd(),
        defaultEnvironment: "default",
        dotIgnoreFiles: defaultDotIgnoreFiles,
        environments: [{ name: "default", defaultNamespace, variables: {} }],
        providers: [{ name: "test", foo: "bar" }],
        variables: {},
      }

      const test = createGardenPlugin({
        name: "test",
        handlers: {
          async configureProvider({ config }: ConfigureProviderParams) {
            expect(config).to.eql({
              name: "test",
              dependencies: [],
              path: projectConfig.path,
              foo: "bar",
            })
            return { config: { ...config, foo: "bla" } }
          },
        },
      })

      const garden = await TestGarden.factory(projectConfig.path, {
        plugins: [test],
        config: projectConfig,
      })

      const provider = await garden.resolveProvider(garden.log, "test")

      expect(provider.config).to.eql({
        name: "test",
        dependencies: [],
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
        environments: [{ name: "default", defaultNamespace, variables: {} }],
        providers: [{ name: "test", foo: "${bla.ble}" }],
        variables: {},
      }

      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins: [test] })
      await expectError(
        () => garden.resolveProviders(garden.log),
        (err) => {
          expect(err.message).to.equal("Failed resolving one or more providers:\n" + "- test")
          expect(stripAnsi(err.detail.messages[0])).to.equal(
            "- test: Invalid template string (${bla.ble}): Could not find key bla. Available keys: command, environment, git, local, project, providers, secrets, var and variables."
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
        environments: [{ name: "default", defaultNamespace, variables: {} }],
        providers: [{ name: "test", foo: "${providers.foo.config.bla}" }],
        variables: {},
      }

      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins: [test] })
      await expectError(() => garden.resolveProviders(garden.log))
    })

    it("should add plugin modules if returned by the provider", async () => {
      const pluginModule: ModuleConfig = {
        apiVersion: DEFAULT_API_VERSION,
        allowPublish: false,
        build: { dependencies: [] },
        disabled: false,
        name: "foo",
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
        environments: [{ name: "default", defaultNamespace, variables: {} }],
        providers: [{ name: "test", foo: "bar" }],
        variables: {},
      }

      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins: [test] })

      const graph = await garden.getConfigGraph(garden.log)
      expect(graph.getModule("test--foo")).to.exist
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
        environments: [{ name: "default", defaultNamespace, variables: {} }],
        providers: [{ name: "test-a" }, { name: "test-b" }],
        variables: {},
      }

      const plugins = [testA, testB]
      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins })

      await expectError(
        () => garden.resolveProviders(garden.log),
        (err) =>
          expect(err.message).to.equal(
            "Found a circular dependency between registered plugins:\n\ntest-a <- test-b <- test-a"
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
        environments: [{ name: "default", defaultNamespace, variables: {} }],
        providers: [{ name: "test-a" }],
        variables: {},
      }

      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins: [testA] })

      await expectError(
        () => garden.resolveProviders(garden.log),
        (err) =>
          expect(err.message).to.equal("Found a circular dependency between registered plugins:\n\ntest-a <- test-a")
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
        environments: [{ name: "default", defaultNamespace, variables: {} }],
        providers: [
          { name: "test-a", foo: "${providers.test-b.outputs.foo}" },
          { name: "test-b", foo: "${providers.test-a.outputs.foo}" },
        ],
        variables: {},
      }

      const plugins = [testA, testB]
      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins })

      await expectError(
        () => garden.resolveProviders(garden.log),
        (err) =>
          expect(err.message).to.equal(deline`
            One or more circular dependencies found between providers or their configurations:\n\ntest-a <- test-b <- test-a
          `)
      )
    })

    it("should throw if provider configs have combined implicit and declared circular dependencies", async () => {
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
        environments: [{ name: "default", defaultNamespace, variables: {} }],
        providers: [
          { name: "test-a", foo: "${providers.test-b.outputs.foo}" },
          { name: "test-b", dependencies: ["test-a"] },
        ],
        variables: {},
      }

      const plugins = [testA, testB]
      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins })

      await expectError(
        () => garden.resolveProviders(garden.log),
        (err) =>
          expect(err.message).to.equal(deline`
            One or more circular dependencies found between providers or their
            configurations:\n\ntest-a <- test-b <- test-a
          `)
      )
    })

    it("should throw if provider configs have combined implicit and plugin circular dependencies", async () => {
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
        environments: [{ name: "default", defaultNamespace, variables: {} }],
        providers: [{ name: "test-a", foo: "${providers.test-b.outputs.foo}" }, { name: "test-b" }],
        variables: {},
      }

      const plugins = [testA, testB]
      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins })

      await expectError(
        () => garden.resolveProviders(garden.log),
        (err) =>
          expect(err.message).to.equal(deline`
            One or more circular dependencies found between providers or their
            configurations:\n\ntest-a <- test-b <- test-a
          `)
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
        environments: [{ name: "default", defaultNamespace, variables: {} }],
        providers: [{ name: "test" }],
        variables: {},
      }

      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins: [test] })
      const providers = keyBy(await garden.resolveProviders(garden.log), "name")

      expect(providers.test).to.exist
      expect(providers.test.config["foo"]).to.equal("bar")
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
        environments: [{ name: "default", defaultNamespace, variables: {} }],
        providers: [{ name: "test", foo: 123 }],
        variables: {},
      }

      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins: [test] })

      await expectError(
        () => garden.resolveProviders(garden.log),
        (err) => {
          expect(err.message).to.equal("Failed resolving one or more providers:\n" + "- test")
          expect(stripAnsi(err.detail.messages[0])).to.equal(
            "- test: Error validating provider configuration: key .foo must be a string"
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
        environments: [{ name: "default", defaultNamespace, variables: {} }],
        providers: [{ name: "test" }],
        variables: {},
      }

      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins: [test] })

      await expectError(
        () => garden.resolveProviders(garden.log),
        (err) => {
          expect(err.message).to.equal("Failed resolving one or more providers:\n" + "- test")
          expect(stripAnsi(err.detail.messages[0])).to.equal(
            "- test: Error validating provider configuration: key .foo must be a string"
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
        environments: [{ name: "default", defaultNamespace, variables: {} }],
        providers: [{ name: "test-a" }, { name: "test-b", foo: "${providers.test-a.outputs.foo}" }],
        variables: {},
      }

      const plugins = [testA, testB]
      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins })

      const providerB = await garden.resolveProvider(garden.log, "test-b")

      expect(providerB.config["foo"]).to.equal("bar")
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
          { name: "dev", defaultNamespace, variables: {} },
          { name: "prod", defaultNamespace, variables: {} },
        ],
        providers: [
          { name: "test-a", environments: ["prod"] },
          { name: "test-b", foo: "${providers.test-a.outputs.foo || 'default'}" },
        ],
        variables: {},
      }

      const plugins = [testA, testB]
      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins })

      const providerB = await garden.resolveProvider(garden.log, "test-b")

      expect(providerB.config["foo"]).to.equal("default")
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
        environments: [{ name: "default", defaultNamespace, variables: { "my-variable": "bar" } }],
        providers: [{ name: "test-a", foo: "${var.my-variable}" }],
        variables: {},
      }

      const plugins = [testA]
      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins })

      const providerB = await garden.resolveProvider(garden.log, "test-a")

      expect(providerB.config["foo"]).to.equal("bar")
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
        environments: [{ name: "default", defaultNamespace, variables: {} }],
        providers: [{ name: "test-a" }, { name: "test-b" }],
        variables: {},
      }

      const plugins = [baseA, testA, testB]
      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins })

      const providerA = await garden.resolveProvider(garden.log, "test-a")
      const providerB = await garden.resolveProvider(garden.log, "test-b")

      expect(providerB.dependencies).to.eql({ "test-a": providerA })
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
        environments: [{ name: "default", defaultNamespace, variables: {} }],
        providers: [{ name: "test-a" }, { name: "test-b" }, { name: "test-c" }],
        variables: {},
      }

      const plugins = [baseA, testA, testB, testC]
      const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins })

      const providerA = await garden.resolveProvider(garden.log, "test-a")
      const providerB = await garden.resolveProvider(garden.log, "test-b")
      const providerC = await garden.resolveProvider(garden.log, "test-c")

      expect(providerC.dependencies).to.eql({ "test-a": providerA, "test-b": providerB })
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
          environments: [{ name: "default", defaultNamespace, variables: {} }],
          providers: [{ name: "test", foo: 123 }],
          variables: {},
        }

        const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins: [base, test] })

        await expectError(
          () => garden.resolveProviders(garden.log),
          (err) => {
            expect(err.message).to.equal("Failed resolving one or more providers:\n" + "- test")
            expect(stripAnsi(err.detail.messages[0])).to.equal(
              "- test: Error validating provider configuration: key .foo must be a string"
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
          environments: [{ name: "default", defaultNamespace, variables: {} }],
          providers: [{ name: "test" }],
          variables: {},
        }

        const garden = await TestGarden.factory(projectRootA, { config: projectConfig, plugins: [base, test] })

        await expectError(
          () => garden.resolveProviders(garden.log),
          (err) => {
            expect(err.message).to.equal("Failed resolving one or more providers:\n" + "- test")
            expect(stripAnsi(err.detail.messages[0])).to.equal(
              "- test: Error validating provider configuration (base schema from 'base' plugin): key .foo must be a string"
            )
          }
        )
      })
    })
  })

  describe("getProjectSources", () => {
    it("should correctly resolve template strings in remote source configs", async () => {
      const remoteTag = "feature-branch"
      process.env.TEST_ENV_VAR = "foo"
      const garden = await makeTestGarden(pathFoo, {
        config: {
          apiVersion: DEFAULT_API_VERSION,
          kind: "Project",
          name: "test",
          path: pathFoo,
          defaultEnvironment: "default",
          dotIgnoreFiles: [],
          environments: [{ name: "default", defaultNamespace, variables: { remoteTag } }],
          providers: [{ name: "test-plugin" }],
          variables: { sourceName: "${local.env.TEST_ENV_VAR}" },
          sources: [
            {
              name: "${var.sourceName}",
              repositoryUrl: "git://github.com/foo/bar.git#${var.remoteTag}",
            },
          ],
        },
      })

      const sources = garden.getProjectSources()

      expect(sources).to.eql([{ name: "foo", repositoryUrl: "git://github.com/foo/bar.git#feature-branch" }])

      delete process.env.TEST_ENV_VAR
    })

    it("should validate the resolved remote sources", async () => {
      const remoteTag = "feature-branch"
      process.env.TEST_ENV_VAR = "foo"
      const garden = await makeTestGarden(pathFoo, {
        config: {
          apiVersion: DEFAULT_API_VERSION,
          kind: "Project",
          name: "test",
          path: pathFoo,
          defaultEnvironment: "default",
          dotIgnoreFiles: [],
          environments: [{ name: "default", defaultNamespace, variables: { remoteTag } }],
          providers: [{ name: "test-plugin" }],
          variables: { sourceName: 123 },
          sources: [
            {
              name: "${var.sourceName}",
              repositoryUrl: "git://github.com/foo/bar.git#${var.remoteTag}",
            },
          ],
        },
      })

      expectError(
        () => garden.getProjectSources(),
        (err) =>
          expect(stripAnsi(err.message)).to.equal("Error validating remote source: key [0][name] must be a string")
      )

      delete process.env.TEST_ENV_VAR
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

  describe("scanAndAddConfigs", () => {
    // TODO: assert that gitignore in project root is respected
    it("should scan the project root for modules and add to the context", async () => {
      const garden = await makeTestGardenA()
      await garden.scanAndAddConfigs()

      const modules = await garden.resolveModules({ log: garden.log })
      expect(getNames(modules).sort()).to.eql(["module-a", "module-b", "module-c"])
    })

    it("should scan and add modules for projects with configs defining multiple modules", async () => {
      const garden = await makeTestGarden(resolve(dataDir, "test-projects", "multiple-module-config"))
      await garden.scanAndAddConfigs()

      const modules = await garden.resolveModules({ log: garden.log })
      expect(getNames(modules).sort()).to.eql([
        "module-a1",
        "module-a2",
        "module-b1",
        "module-b2",
        "module-c",
        "module-from-project-config",
      ])
    })

    it("should scan and add modules contained in custom-named config files", async () => {
      const garden = await makeTestGarden(resolve(dataDir, "test-projects", "custom-config-names"))
      await garden.scanAndAddConfigs()

      const modules = await garden.resolveModules({ log: garden.log })
      expect(getNames(modules).sort()).to.eql(["module-a", "module-b"])
    })

    it("should scan and add workflows contained in custom-named config files", async () => {
      const garden = await makeTestGarden(resolve(dataDir, "test-projects", "custom-config-names"))
      await garden.scanAndAddConfigs()

      const workflows = await garden.getRawWorkflowConfigs()
      expect(getNames(workflows)).to.eql(["workflow-a", "workflow-b"])
    })

    it("should scan and add modules for projects with external project sources", async () => {
      const garden = await makeExtProjectSourcesGarden()
      await garden.scanAndAddConfigs()

      const modules = await garden.resolveModules({ log: garden.log })
      expect(getNames(modules).sort()).to.eql(["module-a", "module-b", "module-c"])
    })

    it("should resolve template strings in project source definitions", async () => {
      const garden = await makeTestGarden(resolve(dataDir, "test-project-ext-project-sources"))
      const sourcesPath = join(garden.gardenDirPath, "sources")

      if (await pathExists(sourcesPath)) {
        await remove(sourcesPath)
        await mkdirp(sourcesPath)
      }

      const localSourcePath = resolve(dataDir, "test-project-local-project-sources", "source-a")
      const _tmpDir = await makeTempDir()

      try {
        // Create a temporary git repo to clone
        const repoPath = resolve(_tmpDir.path, garden.projectName)
        await copy(localSourcePath, repoPath)
        await exec("git", ["init"], { cwd: repoPath })
        await exec("git", ["add", "."], { cwd: repoPath })
        await exec("git", ["commit", "-m", "foo"], { cwd: repoPath })

        garden.variables.sourceBranch = "master"

        const _garden = garden as any
        _garden["projectSources"] = [
          {
            name: "source-a",
            // Use a couple of template strings in the repo path
            repositoryUrl: "file://" + _tmpDir.path + "/${project.name}#${var.sourceBranch}",
          },
        ]

        await garden.scanAndAddConfigs()

        const modules = await garden.resolveModules({ log: garden.log })
        expect(getNames(modules).sort()).to.eql(["module-a"])
      } finally {
        await _tmpDir.cleanup()
      }
    })

    it("should resolve module templates and any modules referencing them", async () => {
      const root = resolve(dataDir, "test-projects", "module-templates")
      const garden = await makeTestGarden(root)
      await garden.scanAndAddConfigs()

      const configA = (await garden.getRawModuleConfigs(["foo-test-a"]))[0]
      const configB = (await garden.getRawModuleConfigs(["foo-test-b"]))[0]

      expect(omitUndefined(configA)).to.eql({
        apiVersion: "garden.io/v0",
        kind: "Module",
        build: {
          dependencies: [],
        },
        include: [],
        configPath: resolve(root, "modules.garden.yml"),
        name: "foo-test-a",
        path: root,
        serviceConfigs: [],
        spec: {
          build: {
            dependencies: [],
          },
          extraFlags: ["${providers.test-plugin.outputs.testKey}"],
        },
        testConfigs: [],
        type: "test",
        taskConfigs: [],
        generateFiles: [
          {
            sourcePath: undefined,
            targetPath: "module-a.log",
            value: "hellow",
          },
        ],
        parentName: "foo",
        templateName: "combo",
        inputs: {
          name: "test",
          value: "${providers.test-plugin.outputs.testKey}",
        },
      })
      expect(omitUndefined(configB)).to.eql({
        apiVersion: "garden.io/v0",
        kind: "Module",
        build: {
          dependencies: [{ name: "foo-test-a", copy: [] }],
        },
        include: [],
        configPath: resolve(root, "modules.garden.yml"),
        name: "foo-test-b",
        path: root,
        serviceConfigs: [],
        spec: {
          build: {
            dependencies: [{ name: "foo-test-a", copy: [] }],
          },
        },
        testConfigs: [],
        type: "test",
        taskConfigs: [],
        generateFiles: [
          {
            targetPath: "module-b.log",
            sourcePath: resolve(root, "source.txt"),
          },
        ],
        parentName: "foo",
        templateName: "combo",
        inputs: {
          name: "test",
          value: "${providers.test-plugin.outputs.testKey}",
        },
      })
    })

    it("should throw on duplicate module template names", async () => {
      const garden = await makeTestGarden(resolve(dataDir, "test-projects", "duplicate-module-templates"))

      await expectError(
        () => garden.scanAndAddConfigs(),
        (err) =>
          expect(err.message).to.equal(
            dedent`
            Found duplicate names of ModuleTemplates:
            Name combo is used at templates.garden.yml and templates.garden.yml
            `
          )
      )
    })

    it("should throw when two modules have the same name", async () => {
      const garden = await makeTestGarden(resolve(dataDir, "test-projects", "duplicate-module"))

      await expectError(
        () => garden.scanAndAddConfigs(),
        (err) =>
          expect(err.message).to.equal(
            "Module module-a is declared multiple times (in 'module-a/garden.yml' and 'module-b/garden.yml')"
          )
      )
    })

    it("should respect the modules.include and modules.exclude fields, if specified", async () => {
      const projectRoot = getDataDir("test-projects", "project-include-exclude")
      const garden = await makeTestGarden(projectRoot)
      const modules = await garden.resolveModules({ log: garden.log })

      // Should NOT include "nope" and "module-c"
      expect(getNames(modules).sort()).to.eql(["module-a", "module-b"])
    })

    it("should respect .gitignore and .gardenignore files", async () => {
      const projectRoot = getDataDir("test-projects", "dotignore")
      const garden = await makeTestGarden(projectRoot)
      const modules = await garden.resolveModules({ log: garden.log })

      expect(getNames(modules).sort()).to.eql(["module-a"])
    })

    it("should respect custom dotignore files", async () => {
      const projectRoot = getDataDir("test-projects", "dotignore")
      const garden = await makeTestGarden(projectRoot)
      const modules = await garden.resolveModules({ log: garden.log })

      expect(getNames(modules).sort()).to.eql(["module-a"])
    })

    it("should throw a nice error if module paths overlap", async () => {
      const projectRoot = getDataDir("test-projects", "multiple-module-config-bad")
      const garden = await makeTestGarden(projectRoot)
      await expectError(
        () => garden.resolveModules({ log: garden.log }),
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

    it.skip("should throw an error if references to missing secrets are present in a module config", async () => {
      const garden = await makeTestGarden(join(dataDir, "missing-secrets", "module"))
      await expectError(
        () => garden.scanAndAddConfigs(),
        (err) => expect(err.message).to.match(/Module module-a: missing/)
      )
    })
  })

  describe("resolveModules", () => {
    it("should throw if a module references itself in a template string", async () => {
      const projectRoot = resolve(dataDir, "test-projects", "module-self-ref")
      const garden = await makeTestGarden(projectRoot)
      const key = "${modules.module-a.version}"
      await expectError(
        () => garden.resolveModules({ log: garden.log }),
        (err) =>
          expect(stripAnsi(err.message)).to.equal(dedent`
            Failed resolving one or more modules:

            module-a: Invalid template string (${key}): Module module-a cannot reference itself.
          `)
      )
    })

    it("should resolve module path to external sources dir if module has a remote source", async () => {
      const projectRoot = resolve(dataDir, "test-project-ext-module-sources")
      const garden = await makeExtModuleSourcesGarden()

      const module = await garden.resolveModule("module-a")

      expect(module!.path).to.equal(join(projectRoot, ".garden", "sources", "module", `module-a--${testGitUrlHash}`))
    })

    it("should handle template variables for non-string fields", async () => {
      const projectRoot = getDataDir("test-projects", "non-string-template-values")
      const garden = await makeTestGarden(projectRoot)

      const module = await garden.resolveModule("module-a")

      // We template in the value for the module's allowPublish field to test this
      expect(module.allowPublish).to.equal(false)
    })

    it("should correctly resolve template strings referencing nested variables", async () => {
      const test = createGardenPlugin({
        name: "test",
        createModuleTypes: [
          {
            name: "test",
            docs: "test",
            schema: joi.object().keys({ bla: joi.string() }),
            handlers: {},
          },
        ],
      })

      const garden = await TestGarden.factory(pathFoo, {
        plugins: [test],
        config: {
          apiVersion: DEFAULT_API_VERSION,
          kind: "Project",
          name: "test",
          path: pathFoo,
          defaultEnvironment: "default",
          dotIgnoreFiles: [],
          environments: [{ name: "default", defaultNamespace, variables: { some: { nested: { key: "my value" } } } }],
          providers: [{ name: "test" }],
          variables: {},
        },
      })

      garden.setModuleConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          name: "module-a",
          type: "test",
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          path: pathFoo,
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [],
          spec: { bla: "${var.some.nested.key}" },
        },
      ])

      const module = await garden.resolveModule("module-a")

      expect(module.spec.bla).to.equal("my value")
    })

    it("should correctly resolve template strings referencing objects", async () => {
      const test = createGardenPlugin({
        name: "test",
        createModuleTypes: [
          {
            name: "test",
            docs: "test",
            schema: joi.object().keys({ bla: joi.object() }),
            handlers: {},
          },
        ],
      })

      const garden = await TestGarden.factory(pathFoo, {
        plugins: [test],
        config: {
          apiVersion: DEFAULT_API_VERSION,
          kind: "Project",
          name: "test",
          path: pathFoo,
          defaultEnvironment: "default",
          dotIgnoreFiles: [],
          environments: [{ name: "default", defaultNamespace, variables: { some: { nested: { key: "my value" } } } }],
          providers: [{ name: "test" }],
          variables: {},
        },
      })

      garden.setModuleConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          name: "module-a",
          type: "test",
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          path: pathFoo,
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [],
          spec: { bla: "${var.some}" },
        },
      ])

      const module = await garden.resolveModule("module-a")

      expect(module.spec.bla).to.eql({ nested: { key: "my value" } })
    })

    it("should pass through runtime template strings when no runtimeContext is provider", async () => {
      const test = createGardenPlugin({
        name: "test",
        createModuleTypes: [
          {
            name: "test",
            docs: "test",
            schema: joi.object().keys({ bla: joi.string() }),
            handlers: {},
          },
        ],
      })

      const garden = await TestGarden.factory(pathFoo, {
        plugins: [test],
        config: {
          apiVersion: DEFAULT_API_VERSION,
          kind: "Project",
          name: "test",
          path: pathFoo,
          defaultEnvironment: "default",
          dotIgnoreFiles: [],
          environments: [{ name: "default", defaultNamespace, variables: {} }],
          providers: [{ name: "test" }],
          variables: {},
        },
      })

      garden.setModuleConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          name: "module-a",
          type: "test",
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          path: pathFoo,
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [],
          spec: { bla: "${runtime.services.foo.bar || 'default'}" },
        },
      ])

      const module = await garden.resolveModule("module-a")

      expect(module.spec.bla).to.equal("${runtime.services.foo.bar || 'default'}")
    })

    it("should resolve conditional strings with missing variables", async () => {
      const test = createGardenPlugin({
        name: "test",
        createModuleTypes: [
          {
            name: "test",
            docs: "test",
            schema: joi.object().keys({ bla: joi.string() }),
            handlers: {},
          },
        ],
      })

      const garden = await TestGarden.factory(pathFoo, {
        plugins: [test],
        config: {
          apiVersion: DEFAULT_API_VERSION,
          kind: "Project",
          name: "test",
          path: pathFoo,
          defaultEnvironment: "default",
          dotIgnoreFiles: [],
          environments: [{ name: "default", defaultNamespace, variables: {} }],
          providers: [{ name: "test" }],
          variables: {},
        },
      })

      garden.setModuleConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          name: "module-a",
          type: "test",
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          path: pathFoo,
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [],
          spec: { bla: "${var.foo || 'default'}" },
        },
      ])

      const module = await garden.resolveModule("module-a")

      expect(module.spec.bla).to.equal("default")
    })

    it("should correctly resolve template strings with $merge keys", async () => {
      const test = createGardenPlugin({
        name: "test",
        createModuleTypes: [
          {
            name: "test",
            docs: "test",
            schema: joi.object().keys({ bla: joi.object() }),
            handlers: {},
          },
        ],
      })

      const garden = await TestGarden.factory(pathFoo, {
        plugins: [test],
        config: {
          apiVersion: DEFAULT_API_VERSION,
          kind: "Project",
          name: "test",
          path: pathFoo,
          defaultEnvironment: "default",
          dotIgnoreFiles: [],
          environments: [{ name: "default", defaultNamespace, variables: { obj: { b: "B", c: "c" } } }],
          providers: [{ name: "test" }],
          variables: {},
        },
      })

      garden.setModuleConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          name: "module-a",
          type: "test",
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          path: pathFoo,
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [],
          spec: {
            bla: {
              a: "a",
              b: "b",
              $merge: "${var.obj}",
            },
          },
        },
      ])

      const module = await garden.resolveModule("module-a")

      expect(module.spec.bla).to.eql({ a: "a", b: "B", c: "c" })
    })

    it("should correctly handle build dependencies added by module configure handlers", async () => {
      const test = createGardenPlugin({
        name: "test",
        createModuleTypes: [
          {
            name: "test",
            docs: "test",
            schema: joi.object(),
            handlers: {
              async configure({ moduleConfig }) {
                if (moduleConfig.name === "module-b") {
                  moduleConfig.build.dependencies = [{ name: "module-a", copy: [] }]
                }
                return { moduleConfig }
              },
            },
          },
        ],
      })

      const garden = await TestGarden.factory(pathFoo, {
        plugins: [test],
        config: {
          apiVersion: DEFAULT_API_VERSION,
          kind: "Project",
          name: "test",
          path: pathFoo,
          defaultEnvironment: "default",
          dotIgnoreFiles: [],
          environments: [{ name: "default", defaultNamespace, variables: {} }],
          providers: [{ name: "test" }],
          variables: {},
        },
      })

      garden.setModuleConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          name: "module-a",
          type: "test",
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          include: [],
          path: pathFoo,
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [],
          spec: {},
        },
        {
          apiVersion: DEFAULT_API_VERSION,
          name: "module-b",
          type: "test",
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          include: [],
          path: pathFoo,
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [],
          spec: {},
        },
      ])

      const module = await garden.resolveModule("module-b")

      expect(module.buildDependencies["module-a"]?.name).to.equal("module-a")
    })

    it("should handle module references within single file", async () => {
      const projectRoot = getDataDir("test-projects", "1067-module-ref-within-file")
      const garden = await makeTestGarden(projectRoot)
      // This should just complete successfully
      await garden.resolveModules({ log: garden.log })
    })

    context("module variables", () => {
      let garden: TestGarden

      const test = createGardenPlugin({
        name: "test",
        createModuleTypes: [
          {
            name: "test",
            docs: "test",
            schema: joi.object().keys({ bla: joi.any() }),
            handlers: {},
          },
        ],
      })

      beforeEach(async () => {
        garden = await TestGarden.factory(pathFoo, {
          plugins: [test],
          config: {
            apiVersion: DEFAULT_API_VERSION,
            kind: "Project",
            name: "test",
            path: pathFoo,
            defaultEnvironment: "default",
            dotIgnoreFiles: [],
            environments: [{ name: "default", defaultNamespace, variables: { some: "variable" } }],
            providers: [{ name: "test" }],
            variables: {},
          },
        })
      })

      it("resolves referenced project variables", async () => {
        garden.setModuleConfigs([
          {
            apiVersion: DEFAULT_API_VERSION,
            name: "module-a",
            type: "test",
            allowPublish: false,
            build: { dependencies: [] },
            disabled: false,
            path: pathFoo,
            serviceConfigs: [],
            taskConfigs: [],
            testConfigs: [],
            spec: {
              bla: "${var.some}",
            },
          },
        ])

        const module = await garden.resolveModule("module-a")

        expect(module.spec.bla).to.equal("variable")
      })

      it("resolves referenced module variables", async () => {
        garden.setModuleConfigs([
          {
            apiVersion: DEFAULT_API_VERSION,
            name: "module-a",
            type: "test",
            allowPublish: false,
            build: { dependencies: [] },
            disabled: false,
            path: pathFoo,
            serviceConfigs: [],
            taskConfigs: [],
            testConfigs: [],
            spec: {
              bla: "${var.foo}",
            },
            variables: {
              foo: "bar",
            },
          },
        ])

        const module = await garden.resolveModule("module-a")

        expect(module.spec.bla).to.equal("bar")
      })

      it("prefers module variables over project variables", async () => {
        garden.setModuleConfigs([
          {
            apiVersion: DEFAULT_API_VERSION,
            name: "module-a",
            type: "test",
            allowPublish: false,
            build: { dependencies: [] },
            disabled: false,
            path: pathFoo,
            serviceConfigs: [],
            taskConfigs: [],
            testConfigs: [],
            spec: {
              bla: "${var.some}",
            },
            variables: {
              some: "foo",
            },
          },
        ])

        const module = await garden.resolveModule("module-a")

        expect(module.spec.bla).to.equal("foo")
      })

      it("resolves project variables in module variables", async () => {
        garden.setModuleConfigs([
          {
            apiVersion: DEFAULT_API_VERSION,
            name: "module-a",
            type: "test",
            allowPublish: false,
            build: { dependencies: [] },
            disabled: false,
            path: pathFoo,
            serviceConfigs: [],
            taskConfigs: [],
            testConfigs: [],
            spec: {
              bla: "${var.some}",
            },
            variables: {
              some: "prefix-${var.some}",
            },
          },
        ])

        const module = await garden.resolveModule("module-a")

        expect(module.spec.bla).to.equal("prefix-variable")
      })

      it("exposes module vars to other modules", async () => {
        garden.setModuleConfigs([
          {
            apiVersion: DEFAULT_API_VERSION,
            name: "module-a",
            type: "test",
            allowPublish: false,
            build: { dependencies: [] },
            disabled: false,
            path: pathFoo,
            serviceConfigs: [],
            taskConfigs: [],
            testConfigs: [],
            spec: {},
            variables: {
              foo: "bar",
            },
          },
          {
            apiVersion: DEFAULT_API_VERSION,
            name: "module-b",
            type: "test",
            allowPublish: false,
            build: { dependencies: [] },
            disabled: false,
            path: projectRootA,
            serviceConfigs: [],
            taskConfigs: [],
            testConfigs: [],
            spec: {
              bla: "${modules.module-a.var.foo}",
            },
          },
        ])

        const module = await garden.resolveModule("module-b")

        expect(module.spec.bla).to.equal("bar")
      })
    })

    it("resolves and writes a module file with a string value", async () => {
      const projectRoot = getDataDir("test-projects", "module-templates")
      const filePath = resolve(projectRoot, "module-a.log")

      await remove(filePath)

      const garden = await makeTestGarden(projectRoot)
      await garden.resolveModules({ log: garden.log })

      const fileContents = await readFile(filePath)

      expect(fileContents.toString()).to.equal("hellow")
    })

    it("resolves and writes a module file with a source file", async () => {
      const projectRoot = getDataDir("test-projects", "module-templates")
      const filePath = resolve(projectRoot, "module-b.log")

      await remove(filePath)

      const garden = await makeTestGarden(projectRoot)
      await garden.resolveModules({ log: garden.log })

      const fileContents = await readFile(filePath)

      expect(fileContents.toString().trim()).to.equal(dedent`
        Hello I am file!
        input: testValue
        module reference: ${projectRoot}
      `)
    })

    it("resolves and writes a module file to a subdirectory and creates the directory", async () => {
      const projectRoot = getDataDir("test-projects", "module-templates")
      const filePath = resolve(projectRoot, ".garden", "subdir", "module-c.log")

      await remove(filePath)

      const garden = await makeTestGarden(projectRoot)
      await garden.resolveModules({ log: garden.log })

      const fileContents = await readFile(filePath)

      expect(fileContents.toString().trim()).to.equal(dedent`
        Hello I am string!
        input: testValue
        module reference: ${projectRoot}
      `)
    })

    it("passes escaped template strings through when rendering a file", async () => {
      const garden = await makeTestGardenA()

      const targetPath = "targetfile.log"

      garden.setModuleConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          name: "module-a",
          type: "test",
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          include: [],
          path: pathFoo,
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [],
          spec: {},
          generateFiles: [
            {
              value: "Project name: ${project.name}, Escaped string: $${var.foo}",
              targetPath,
            },
          ],
        },
      ])

      const module = await garden.resolveModule("module-a")
      const expectedTargetPath = join(module.path, targetPath)
      const contents = await readFile(expectedTargetPath)

      expect(contents.toString()).to.equal("Project name: test-project-a, Escaped string: ${var.foo}")
    })

    it("resolves and writes a module file in a remote module", async () => {
      const garden = await makeTestGarden(pathFoo, {
        config: {
          apiVersion: DEFAULT_API_VERSION,
          kind: "Project",
          name: "test",
          path: pathFoo,
          defaultEnvironment: "default",
          dotIgnoreFiles: [],
          environments: [{ name: "default", defaultNamespace, variables: {} }],
          providers: [{ name: "test-plugin" }],
          variables: {},
        },
      })

      const sourcePath = randomString(8) + ".log"
      const sourceFullPath = join(pathFoo, sourcePath)
      const tmpRepo = await makeTempDir({ git: true })

      try {
        const targetPath = "targetfile.log"
        await writeFile(sourceFullPath, "hello ${project.name}")

        garden.setModuleConfigs([
          {
            apiVersion: DEFAULT_API_VERSION,
            name: "module-a",
            type: "test",
            allowPublish: false,
            build: { dependencies: [] },
            disabled: false,
            include: [],
            configPath: join(pathFoo, "module-a.garden.yml"),
            path: pathFoo,
            serviceConfigs: [],
            taskConfigs: [],
            testConfigs: [],
            spec: {},
            repositoryUrl: "file://" + tmpRepo.path + "#master",
            generateFiles: [
              {
                sourcePath,
                targetPath,
              },
            ],
          },
        ])

        const module = await garden.resolveModule("module-a")

        // Make sure the resolved module path is in the .garden directory because it's a remote module
        expect(module.path.startsWith(garden.gardenDirPath)).to.be.true

        const expectedTargetPath = join(module.path, targetPath)
        const contents = await readFile(expectedTargetPath)

        expect(contents.toString()).to.equal("hello test")
      } finally {
        await remove(sourceFullPath)
        await tmpRepo.cleanup()
      }
    })

    it("resolves and writes a module file in a linked remote module", async () => {
      const garden = await makeTestGarden(pathFoo, {
        config: {
          apiVersion: DEFAULT_API_VERSION,
          kind: "Project",
          name: "test",
          path: pathFoo,
          defaultEnvironment: "default",
          dotIgnoreFiles: [],
          environments: [{ name: "default", defaultNamespace, variables: {} }],
          providers: [{ name: "test-plugin" }],
          variables: {},
        },
      })

      const sourcePath = randomString(8) + ".log"
      const sourceFullPath = join(pathFoo, sourcePath)
      const tmpRepo = await makeTempDir({ git: true })

      try {
        const targetPath = "targetfile.log"
        await writeFile(sourceFullPath, "hello ${project.name}")

        garden.setModuleConfigs([
          {
            apiVersion: DEFAULT_API_VERSION,
            name: "module-a",
            type: "test",
            allowPublish: false,
            build: { dependencies: [] },
            disabled: false,
            include: [],
            configPath: join(pathFoo, "module-a.garden.yml"),
            path: pathFoo,
            serviceConfigs: [],
            taskConfigs: [],
            testConfigs: [],
            spec: {},
            repositoryUrl: "file://" + tmpRepo.path + "#master",
            generateFiles: [
              {
                sourcePath,
                targetPath,
              },
            ],
          },
        ])

        await addLinkedSources({
          garden,
          sourceType: "module",
          sources: [{ name: "module-a", path: tmpRepo.path }],
        })

        const module = await garden.resolveModule("module-a")
        expect(module.path).to.equal(tmpRepo.path)

        const expectedTargetPath = join(module.path, targetPath)
        const contents = await readFile(expectedTargetPath)

        expect(contents.toString()).to.equal("hello test")
      } finally {
        await remove(sourceFullPath)
        await tmpRepo.cleanup()
      }
    })

    it("resolves and writes a module file in a module from a remote source", async () => {
      const targetPath = "targetfile.log"

      const tmpRepo = await makeTempDir({ git: true })
      const sourcePath = randomString(8) + ".log"
      const sourceFullPath = join(tmpRepo.path, sourcePath)

      try {
        await writeFile(sourceFullPath, "hello ${project.name}")

        const moduleConfig = {
          kind: "Module",
          name: "module-a",
          type: "test",
          generateFiles: [
            {
              sourcePath,
              targetPath,
            },
          ],
        }

        await writeFile(join(tmpRepo.path, "module-a.garden.yml"), safeDump(moduleConfig))
        await exec("git", ["add", "."], { cwd: tmpRepo.path })
        await exec("git", ["commit", "-m", "add module"], { cwd: tmpRepo.path })

        const garden = await makeTestGarden(pathFoo, {
          config: {
            apiVersion: DEFAULT_API_VERSION,
            kind: "Project",
            name: "test",
            path: pathFoo,
            defaultEnvironment: "default",
            dotIgnoreFiles: [],
            environments: [{ name: "default", defaultNamespace, variables: {} }],
            providers: [{ name: "test-plugin" }],
            sources: [{ name: "remote-module", repositoryUrl: "file://" + tmpRepo.path + "#master" }],
            variables: {},
          },
        })

        const module = await garden.resolveModule("module-a")

        // Make sure the resolved module path is in the .garden directory because it's in a remote source
        expect(module.path.startsWith(garden.gardenDirPath)).to.be.true

        const expectedTargetPath = join(module.path, targetPath)
        const contents = await readFile(expectedTargetPath)

        expect(contents.toString()).to.equal("hello test")
      } finally {
        await remove(sourceFullPath)
        await tmpRepo.cleanup()
      }
    })

    it("resolves and writes a module file in a module from a linked remote source", async () => {
      const targetPath = "targetfile.log"

      const tmpRepo = await makeTempDir({ git: true })
      const sourcePath = randomString(8) + ".log"
      const sourceFullPath = join(tmpRepo.path, sourcePath)

      try {
        await writeFile(sourceFullPath, "hello ${project.name}")

        const moduleConfig = {
          kind: "Module",
          name: "module-a",
          type: "test",
          generateFiles: [
            {
              sourcePath,
              targetPath,
            },
          ],
        }

        await writeFile(join(tmpRepo.path, "module-a.garden.yml"), safeDump(moduleConfig))
        await exec("git", ["add", "."], { cwd: tmpRepo.path })
        await exec("git", ["commit", "-m", "add module"], { cwd: tmpRepo.path })

        const garden = await makeTestGarden(pathFoo, {
          config: {
            apiVersion: DEFAULT_API_VERSION,
            kind: "Project",
            name: "test",
            path: pathFoo,
            defaultEnvironment: "default",
            dotIgnoreFiles: [],
            environments: [{ name: "default", defaultNamespace, variables: {} }],
            providers: [{ name: "test-plugin" }],
            sources: [{ name: "remote-module", repositoryUrl: "file://" + tmpRepo.path + "#master" }],
            variables: {},
          },
        })

        await addLinkedSources({
          garden,
          sourceType: "project",
          sources: [{ name: "remote-module", path: tmpRepo.path }],
        })

        const module = await garden.resolveModule("module-a")
        expect(module.path).to.equal(tmpRepo.path)

        const expectedTargetPath = join(module.path, targetPath)
        const contents = await readFile(expectedTargetPath)

        expect(contents.toString()).to.equal("hello test")
      } finally {
        await remove(sourceFullPath)
        await tmpRepo.cleanup()
      }
    })

    it("should throw if a module type is not recognized", async () => {
      const garden = await makeTestGardenA()
      const config = (await garden.getRawModuleConfigs(["module-a"]))[0]

      config.type = "foo"

      await expectError(
        () => garden.resolveModules({ log: garden.log }),
        (err) =>
          expect(stripAnsi(err.message)).to.equal(dedent`
            Failed resolving one or more modules:

            module-a: Unrecognized module type 'foo' (defined at module-a/garden.yml). Are you missing a provider configuration?
          `)
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

      const garden = await TestGarden.factory(pathFoo, {
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
          path: pathFoo,
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [],
          spec: { bla: "fla" },
        },
      }

      await expectError(
        () => garden.resolveModules({ log: garden.log }),
        (err) =>
          expect(stripAnsi(err.message)).to.equal(dedent`
            Failed resolving one or more modules:

            foo: Error validating Module 'foo': key "bla" is not allowed at path [bla]
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
              getModuleOutputs: async () => ({
                outputs: { foo: 123 },
              }),
            },
          },
        ],
      })

      const garden = await TestGarden.factory(pathFoo, {
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
          path: pathFoo,
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [],
          spec: {},
        },
      }

      await expectError(
        () => garden.resolveModules({ log: garden.log }),
        (err) =>
          expect(stripAnsi(err.message)).to.equal(dedent`
            Failed resolving one or more modules:

            foo: Error validating outputs for module 'foo': key .foo must be a string
          `)
      )
    })
  })

  describe("getConfigGraph", () => {
    it("should throw an error if modules have circular build dependencies", async () => {
      const garden = await TestGarden.factory(pathFoo, {
        config: {
          apiVersion: DEFAULT_API_VERSION,
          kind: "Project",
          name: "test",
          path: pathFoo,
          defaultEnvironment: "default",
          dotIgnoreFiles: [],
          environments: [{ name: "default", defaultNamespace, variables: {} }],
          providers: [],
          variables: {},
        },
      })

      garden.setModuleConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          name: "module-a",
          type: "exec",
          allowPublish: false,
          build: { dependencies: [{ name: "module-b", copy: [] }] }, // <----
          disabled: false,
          path: pathFoo,
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [],
          spec: {},
        },
        {
          apiVersion: DEFAULT_API_VERSION,
          name: "module-b",
          type: "exec",
          allowPublish: false,
          build: { dependencies: [{ name: "module-a", copy: [] }] }, // <----
          disabled: false,
          path: pathFoo,
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [],
          spec: {},
        },
      ])

      await expectError(
        () => garden.getConfigGraph(garden.log),
        (err) =>
          expect(err.message).to.equal(dedent`
          Detected circular dependencies between module configurations:

          module-a <- module-b <- module-a
        `)
      )
    })

    it("fully resolves module template inputs before resolving templated modules", async () => {
      const root = resolve(dataDir, "test-projects", "module-templates")
      const garden = await makeTestGarden(root)

      const graph = await garden.getConfigGraph(garden.log)
      const moduleA = graph.getModule("foo-test-a")

      expect(moduleA.spec.extraFlags).to.eql(["testValue"])
    })

    it("throws if templated module inputs don't match the template inputs schema", async () => {
      const root = resolve(dataDir, "test-projects", "module-templates")
      const garden = await makeTestGarden(root)

      await garden.scanAndAddConfigs()

      const moduleA = garden["moduleConfigs"]["foo-test-a"]
      moduleA.inputs = { name: "test", value: 123 }

      await expectError(
        () => garden.getConfigGraph(garden.log),
        (err) =>
          expect(stripAnsi(err.message)).to.equal(dedent`
          Failed resolving one or more modules:

          foo-test-a: Error validating inputs for module foo-test-a (modules.garden.yml): value at ..value should be string
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

      const garden = await TestGarden.factory(pathFoo, {
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
          path: pathFoo,
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [],
          spec: { foo: "bar" },
        },
      }

      await expectError(
        () => garden.resolveModules({ log: garden.log }),
        (err) =>
          expect(stripAnsi(err.message)).to.equal(dedent`
            Failed resolving one or more modules:

            foo: Error validating configuration for module 'foo' (base schema from 'base' plugin): key .base is required
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
              getModuleOutputs: async () => ({
                outputs: { foo: 123 },
              }),
            },
          },
        ],
      })

      const garden = await TestGarden.factory(pathFoo, {
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
          path: pathFoo,
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [],
          spec: {},
        },
      }

      await expectError(
        () => garden.resolveModules({ log: garden.log }),
        (err) =>
          expect(stripAnsi(err.message)).to.equal(dedent`
            Failed resolving one or more modules:

            foo: Error validating outputs for module 'foo' (base schema from 'base' plugin): key .foo must be a string
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

        const garden = await TestGarden.factory(pathFoo, {
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
            path: pathFoo,
            serviceConfigs: [],
            taskConfigs: [],
            testConfigs: [],
            spec: { foo: "bar" },
          },
        }

        await expectError(
          () => garden.resolveModules({ log: garden.log }),
          (err) =>
            expect(stripAnsi(err.message)).to.equal(dedent`
              Failed resolving one or more modules:

              foo: Error validating configuration for module 'foo' (base schema from 'base-a' plugin): key .base is required
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
                getModuleOutputs: async () => ({
                  outputs: { foo: 123 },
                }),
              },
            },
          ],
        })

        const garden = await TestGarden.factory(pathFoo, {
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
            path: pathFoo,
            serviceConfigs: [],
            taskConfigs: [],
            testConfigs: [],
            spec: {},
          },
        }

        await expectError(
          () => garden.resolveModules({ log: garden.log }),
          (err) =>
            expect(stripAnsi(err.message)).to.equal(dedent`
              Failed resolving one or more modules:

              foo: Error validating outputs for module 'foo' (base schema from 'base-a' plugin): key .foo must be a string
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

        const garden = await TestGarden.factory(pathFoo, {
          plugins: [foo],
          config: projectConfigFoo,
        })

        const module = findByName(await garden.resolveModules({ log: garden.log }), "foo")!

        expect(module.type).to.equal("foo")
        expect(module.spec.foo).to.eql("bar")
        expect(module.path).to.eql("/tmp")
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

        const garden = await TestGarden.factory(pathFoo, {
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
            path: "/tmp",
            include: [],
            serviceConfigs: [],
            taskConfigs: [],
            testConfigs: [],
            spec: {},
          },
        }

        const module = findByName(await garden.resolveModules({ log: garden.log }), "foo")!

        expect(module).to.exist
        expect(module.build).to.eql({ dependencies: [{ name: "bar", copy: [] }] })
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
                      dependencies: [],
                      disabled: false,
                      hotReloadable: false,
                      spec: {},
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

        const garden = await TestGarden.factory(pathFoo, {
          plugins: [foo],
          config: projectConfigFoo,
        })

        const module = findByName(await garden.resolveModules({ log: garden.log }), "foo")!

        expect(module).to.exist
        expect(module.build).to.eql({ dependencies: [{ name: "bar", copy: [] }] })
        expect(module.serviceConfigs).to.eql([
          {
            name: "foo",
            dependencies: ["bar"],
            disabled: false,
            hotReloadable: false,
            spec: {},
          },
        ])
        expect(module.spec).to.eql({ foo: "bar", build: { dependencies: [] } })
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

        const garden = await TestGarden.factory(pathFoo, {
          plugins: [foo],
          config: projectConfigFoo,
        })

        await expectError(
          () => garden.resolveModules({ log: garden.log }),
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
                      dependencies: [],
                      disabled: false,
                      hotReloadable: false,
                      spec: {},
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

        const garden = await TestGarden.factory(pathFoo, {
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
            path: "/tmp",
            serviceConfigs: [],
            taskConfigs: [],
            testConfigs: [],
            spec: {},
          },
        }

        const module = findByName(await garden.resolveModules({ log: garden.log }), "foo")!

        expect(module).to.exist
        expect(module.serviceConfigs).to.eql([
          {
            name: "foo",
            dependencies: ["bar"],
            disabled: false,
            hotReloadable: false,
            spec: {},
          },
        ])
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
                      dependencies: [],
                      disabled: false,
                      hotReloadable: false,
                      spec: {},
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

        const garden = await TestGarden.factory(pathFoo, {
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
            path: "/tmp",
            serviceConfigs: [],
            taskConfigs: [],
            testConfigs: [],
            spec: {},
          },
        }

        await expectError(
          () => garden.resolveModules({ log: garden.log }),
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
                  {
                    kind: "Module",
                    type: "foo",
                    name: "bar",
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
        let garden = await TestGarden.factory(pathFoo, {
          plugins: [foo, bar],
          config,
        })

        const fooModule = findByName(await garden.resolveModules({ log: garden.log }), "foo")!

        expect(fooModule).to.exist
        expect(fooModule.build).to.eql({ dependencies: [{ name: "bar", copy: [] }] })

        // Then test wrong order and make sure it throws
        foo.dependencies = ["bar"]
        bar.dependencies = []

        garden = await TestGarden.factory(pathFoo, {
          plugins: [foo, bar],
          config,
        })

        await expectError(
          () => garden.resolveModules({ log: garden.log }),
          (err) =>
            expect(stripAnsi(err.message)).to.equal(deline`
              Provider 'bar' added a build dependency by module 'foo' on 'bar' but module 'foo' could not be found.
            `)
        )
      })
    })
  })

  describe("resolveModuleVersion", () => {
    beforeEach(() => td.reset())

    it("should return result from cache if available", async () => {
      const garden = await makeTestGardenA()
      const config = await garden.resolveModule("module-a")
      const version: ModuleVersion = {
        versionString: "banana",
        dependencyVersions: {},
        files: [],
      }
      garden.cache.set(["moduleVersions", config.name], version, getModuleCacheContext(config))

      const result = await garden.resolveModuleVersion(config, [])

      expect(result).to.eql(version)
    })

    it("should otherwise return version from VCS handler", async () => {
      const garden = await makeTestGardenA()
      await garden.scanAndAddConfigs()

      garden.cache.delete(["moduleVersions", "module-b"])

      const config = await garden.resolveModule("module-b")
      const resolveStub = td.replace(garden.vcs, "resolveModuleVersion")
      const version: ModuleVersion = {
        versionString: "banana",
        dependencyVersions: {},
        files: [],
      }

      td.when(resolveStub(), { ignoreExtraArgs: true }).thenResolve(version)

      const result = await garden.resolveModuleVersion(config, [])

      expect(result).to.eql(version)
    })

    it("should ignore cache if force=true", async () => {
      const garden = await makeTestGardenA()
      const config = await garden.resolveModule("module-a")
      const version: ModuleVersion = {
        versionString: "banana",
        dependencyVersions: {},
        files: [],
      }
      garden.cache.set(["moduleVersions", config.name], version, getModuleCacheContext(config))

      const result = await garden.resolveModuleVersion(config, [], true)

      expect(result).to.not.eql(version)
    })

    context("test against fixed version hashes", async () => {
      const moduleAVersionString = "v-0e0d9afd11"
      const moduleBVersionString = "v-8ad15ac4ea"
      const moduleCVersionString = "v-37a858e2ee"

      it("should return the same module versions between runtimes", async () => {
        const projectRoot = getDataDir("test-projects", "fixed-version-hashes-1")

        process.env.MODULE_A_TEST_ENV_VAR = "foo"

        const garden = await makeTestGarden(projectRoot)
        const graph = await garden.getConfigGraph(garden.log)
        const moduleA = graph.getModule("module-a")
        const moduleB = graph.getModule("module-b")
        const moduleC = graph.getModule("module-c")
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
        const moduleA = graph.getModule("module-a")
        const moduleB = graph.getModule("module-b")
        const moduleC = graph.getModule("module-c")
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
        const moduleA = graph.getModule("module-a")
        const moduleB = graph.getModule("module-b")
        const moduleC = graph.getModule("module-c")
        expect(moduleA.version.versionString).to.not.equal(moduleAVersionString)
        expect(moduleB.version.versionString).to.equal(moduleBVersionString)
        expect(moduleC.version.versionString).to.equal(moduleCVersionString)

        delete process.env.MODULE_A_TEST_ENV_VAR
      })
    })
  })

  describe("loadExtSourcePath", () => {
    let garden: TestGarden
    let linkedSources: LinkedSource[]

    afterEach(async () => {
      await resetLocalConfig(garden.gardenDirPath)
    })

    context("external project sources", () => {
      before(async () => {
        garden = await makeExtProjectSourcesGarden()
        linkedSources = await getLinkedSources(garden, "module")
      })

      it("should return the path to the project source if source type is project", async () => {
        const projectRoot = getDataDir("test-project-ext-project-sources")
        const path = await garden.loadExtSourcePath({
          linkedSources,
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

        const path = await garden.loadExtSourcePath({
          name: "source-a",
          linkedSources: linked,
          repositoryUrl: testGitUrl,
          sourceType: "project",
        })

        expect(path).to.equal(linkedSourcePath)
      })
    })

    context("external module sources", () => {
      before(async () => {
        garden = await makeExtModuleSourcesGarden()
        linkedSources = await getLinkedSources(garden, "module")
      })

      it("should return the path to the module source if source type is module", async () => {
        const projectRoot = getDataDir("test-project-ext-module-sources")
        const path = await garden.loadExtSourcePath({
          linkedSources,
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

        const path = await garden.loadExtSourcePath({
          name: "module-a",
          linkedSources: linked,
          repositoryUrl: testGitUrl,
          sourceType: "module",
        })

        expect(path).to.equal(linkedModulePath)
      })
    })
  })
})
