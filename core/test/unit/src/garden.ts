/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import * as td from "testdouble"
import tmp from "tmp-promise"
import nock from "nock"

import { dirname, join, resolve } from "node:path"
import { Garden } from "../../../src/garden.js"
import {
  createProjectConfig,
  expectError,
  expectFuzzyMatch,
  getDataDir,
  getEmptyPluginActionDefinitions,
  makeExtModuleSourcesGarden,
  makeExtProjectSourcesGarden,
  makeModuleConfig,
  makeTempGarden,
  makeTestGarden,
  makeTestGardenA,
  projectRootA,
  resetLocalConfig,
  TestGarden,
  testGitUrl,
  testGitUrlHash,
  testModuleVersion,
  testPlugin,
} from "../../helpers.js"
import type { DeepPartial } from "../../../src/util/util.js"
import { exec, findByName, getNames } from "../../../src/util/util.js"
import type { LinkedSource } from "../../../src/config-store/local.js"
import type { ModuleVersion, TreeVersion } from "../../../src/vcs/vcs.js"
import { getModuleVersionString } from "../../../src/vcs/vcs.js"
import { getModuleCacheContext } from "../../../src/types/module.js"
import type { ProviderActionName } from "../../../src/plugin/plugin.js"
import { createGardenPlugin } from "../../../src/plugin/plugin.js"
import type { ConfigureProviderParams } from "../../../src/plugin/handlers/Provider/configureProvider.js"
import type { ProjectConfig } from "../../../src/config/project.js"
import { defaultNamespace, UnresolvedProviderConfig } from "../../../src/config/project.js"
import type { ModuleConfig } from "../../../src/config/module.js"
import { baseModuleSpecSchema } from "../../../src/config/module.js"
import {
  DEFAULT_BUILD_TIMEOUT_SEC,
  DEFAULT_GARDEN_CLOUD_DOMAIN,
  GardenApiVersion,
  gardenEnv,
} from "../../../src/constants.js"
import { providerConfigBaseSchema } from "../../../src/config/provider.js"
import { cloneDeep, keyBy, mapValues, omit, set } from "lodash-es"
import { joi } from "../../../src/config/common.js"
import { defaultDotIgnoreFile, makeTempDir } from "../../../src/util/fs.js"
import fsExtra from "fs-extra"
import { dedent, randomString } from "../../../src/util/string.js"
import { addLinkedSources, getLinkedSources } from "../../../src/util/ext-source-util.js"
import { dump } from "js-yaml"
import { TestVcsHandler } from "./vcs/vcs.js"
import type { ActionRouter } from "../../../src/router/router.js"
import { convertExecModule } from "../../../src/plugins/exec/convert.js"
import { getLogMessages } from "../../../src/util/testing.js"
import { TreeCache } from "../../../src/cache.js"
import { omitUndefined } from "../../../src/util/objects.js"
import { add } from "date-fns"
import stripAnsi from "strip-ansi"
import { GardenCloudApiLegacy } from "../../../src/cloud/api-legacy/api.js"
import { GlobalConfigStore } from "../../../src/config-store/global.js"
import { getRootLogger } from "../../../src/logger/logger.js"
import { uuidv4 } from "../../../src/util/random.js"
import { fileURLToPath } from "node:url"
import { resolveMsg } from "../../../src/logger/log-entry.js"
import type { RunActionConfig } from "../../../src/actions/run.js"
import type { ProjectResult } from "@garden-io/platform-api-types"
import { ProjectStatus } from "@garden-io/platform-api-types"
import { resolveAction } from "../../../src/graph/actions.js"
import { serialiseUnresolvedTemplates } from "../../../src/template/types.js"
import { parseTemplateCollection } from "../../../src/template/templated-collections.js"
import { deepResolveContext } from "../../../src/config/template-contexts/base.js"
import { VariablesContext } from "../../../src/config/template-contexts/variables.js"
import { GardenCloudTRPCError } from "../../../src/cloud/api/api.js"
import type { ApiTrpcClient } from "../../../src/cloud/api/trpc.js"
import { TRPCClientError } from "@trpc/client"
import { parseTemplateString } from "../../../src/template/templated-strings.js"
import { makeFakeCloudApi } from "../../helpers/api.js"

const { realpath, writeFile, readFile, remove, pathExists, mkdirp, copy } = fsExtra

const moduleDirName = dirname(fileURLToPath(import.meta.url))

// TODO-G2: change all module config based tests to be action-based.

describe("Garden", () => {
  let tmpDir: tmp.DirectoryResult
  let pathFoo: string
  let projectConfigFoo: ProjectConfig

  before(async () => {
    tmpDir = await makeTempDir({ git: true })
    pathFoo = tmpDir.path

    projectConfigFoo = createProjectConfig({
      name: "test",
      path: pathFoo,
      providers: [{ name: "foo" }],
    })
  })

  after(async () => {
    await tmpDir.cleanup()
  })

  beforeEach(async () => {
    td.replace(Garden.prototype, "resolveModuleVersion", async () => testModuleVersion)
  })

  const providerActionHandlerTypes: ProviderActionName[] = [
    "configureProvider",
    "augmentGraph",
    "getEnvironmentStatus",
    "prepareEnvironment",
    "cleanupEnvironment",
    "getDashboardPage",
    "getDebugInfo",
  ]

  describe("factory", () => {
    function getProviderActionHandler(router: ActionRouter, handlerType: ProviderActionName, pluginName: string) {
      return router.provider.getPluginHandler({ handlerType, pluginName })
    }

    function ensureProviderActionHandlers(router: ActionRouter, pluginName: string) {
      providerActionHandlerTypes.forEach((h) => expect(getProviderActionHandler(router, h, pluginName)).to.be.ok)
    }

    it("should initialize and add the action handlers for a plugin", async () => {
      const garden = await makeTestGardenA()
      const actions = await garden.getActionRouter()

      ensureProviderActionHandlers(actions, "test-plugin")
      ensureProviderActionHandlers(actions, "test-plugin-b")
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

      const providers = await garden.resolveProviders({ log: garden.log })
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
          dependencies: [],
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

      const variables = deepResolveContext("Garden variables", garden.variables)
      expect(variables).to.eql({
        some: "variable",
      })
    })

    it("should load a project config in a custom-named config file", async () => {
      const projectRoot = getDataDir("test-projects", "custom-config-names")
      const garden = await TestGarden.factory(projectRoot)
      expect(garden.projectRoot).to.equal(projectRoot)
    })

    it("should resolve templated env variables in project config", async () => {
      process.env.TEST_PROVIDER_TYPE = "test-plugin"
      process.env.TEST_VARIABLE = "banana"

      const projectRoot = getDataDir("test-project-templated")

      const garden = await makeTestGarden(projectRoot, { forceRefresh: true })

      delete process.env.TEST_PROVIDER_TYPE
      delete process.env.TEST_VARIABLE

      const providers = await garden.resolveProviders({ log: garden.log })
      const configs = mapValues(providers, (p) => p.config)

      expect(configs).to.eql({
        "exec": {
          name: "exec",
          dependencies: [],
          path: garden.projectRoot,
        },
        "container": {
          name: "container",
          dependencies: [],
          path: garden.projectRoot,
        },
        "templated": {
          name: "templated",
          dependencies: [],
          path: garden.projectRoot,
        },
        "test-plugin": {
          name: "test-plugin",
          dependencies: [],
          path: garden.projectRoot,
        },
      })

      const variables = deepResolveContext("Garden variables", garden.variables)
      expect(variables).to.eql({
        "some": "banana",
        "service-a-build-command": "OK",
      })
    })

    it("should throw if the specified environment isn't configured", async () => {
      await expectError(async () => makeTestGarden(projectRootA, { environmentString: "bla" }), { type: "parameter" })
    })

    it("should throw if environment starts with 'garden-'", async () => {
      await expectError(async () => makeTestGarden(projectRootA, { environmentString: "garden-bla" }), {
        type: "parameter",
      })
    })

    it("should throw if project.environments is not an array", async () => {
      const projectRoot = getDataDir("test-project-malformed-environments")
      await expectError(async () => makeTestGarden(projectRoot), {
        contains: ["Error validating project environments", "must be an array"],
      })
    })

    it("should throw if project.environments is an empty array", async () => {
      const config: ProjectConfig = createProjectConfig({
        name: "test",
        path: pathFoo,
        providers: [{ name: "foo" }],
      })
      config.environments = [] // <--
      await expectError(async () => await TestGarden.factory(pathFoo, { config }), {
        contains: ["Error validating project environments", "must contain at least 1 items"],
      })
    })

    it("should throw if project.environments is not set", async () => {
      let config: ProjectConfig = createProjectConfig({
        name: "test",
        path: pathFoo,
        environments: [],
        providers: [{ name: "foo" }],
      })
      config.environments = [] // this is omitted later to simulate a config where envs are not set
      config = omit(config, "environments") as ProjectConfig
      await expectError(async () => await TestGarden.factory(pathFoo, { config }), {
        contains: ["Error validating project environments", "environments is required"],
      })
    })

    it("should set .garden as the default cache dir", async () => {
      const projectRoot = getDataDir("test-project-empty")
      const garden = await makeTestGarden(projectRoot, { plugins: [testPlugin()] })
      expect(garden.gardenDirPath).to.eql(join(garden.projectRoot, ".garden"))
    })

    it("prefers default env set in local config over project default", async () => {
      const config = createProjectConfig({
        name: "test",
        defaultEnvironment: "local",
        environments: [
          { name: "local", defaultNamespace: "default", variables: {} },
          { name: "remote", defaultNamespace: "default", variables: {} },
        ],
        providers: [{ name: "test-plugin" }],
      })

      const { garden: _garden } = await makeTempGarden({
        plugins: [testPlugin()],
        config,
      })

      await _garden.localConfigStore.set("defaultEnv", "remote")

      const garden = await TestGarden.factory(_garden.projectRoot, { config })

      expect(garden.environmentName).to.equal("remote")
    })

    it("chooses directly set environmentName over default env in local config", async () => {
      const config = createProjectConfig({
        name: "test",
        defaultEnvironment: "local",
        environments: [
          { name: "local", defaultNamespace: "default", variables: {} },
          { name: "remote", defaultNamespace: "default", variables: {} },
        ],
        providers: [{ name: "test-plugin" }],
      })

      const { garden: _garden } = await makeTempGarden({
        plugins: [testPlugin()],
        config,
      })

      await _garden.localConfigStore.set("defaultEnv", "remote")

      const garden = await TestGarden.factory(_garden.projectRoot, { config, environmentString: "local" })

      expect(garden.environmentName).to.equal("local")
    })

    it("should optionally set a custom cache dir relative to project root", async () => {
      const projectRoot = getDataDir("test-project-empty")
      const garden = await makeTestGarden(projectRoot, {
        plugins: [testPlugin()],
        gardenDirPath: "my/cache/dir",
      })
      expect(garden.gardenDirPath).to.eql(join(garden.projectRoot, "my/cache/dir"))
    })

    it("should optionally set a custom cache dir with an absolute path", async () => {
      const projectRoot = getDataDir("test-project-empty")
      const gardenDirPath = getDataDir("test-garden-dir")
      const garden = await makeTestGarden(projectRoot, {
        plugins: [testPlugin()],
        gardenDirPath,
      })
      expect(garden.gardenDirPath).to.eql(gardenDirPath)
    })

    it("should load default varfiles if they exist", async () => {
      const projectRoot = getDataDir("test-projects", "varfiles")
      const garden = await makeTestGarden(projectRoot, {})
      const variables = deepResolveContext("Garden variables", garden.variables)
      expect(variables).to.eql({
        a: "a",
        b: "B",
        c: "c",
      })
    })

    it("should load custom varfiles if specified", async () => {
      const projectRoot = getDataDir("test-projects", "varfiles-custom")
      const garden = await makeTestGarden(projectRoot, {})
      const variables = deepResolveContext("Garden variables", garden.variables)
      expect(variables).to.eql({
        a: "a",
        b: "B",
        c: "c",
      })
    })

    it("should respect the action variables < action varfile < CLI var precedence order", async () => {
      const projectRoot = getDataDir("test-projects", "action-varfiles")

      const garden = await makeTestGarden(projectRoot)
      // In the normal flow, `garden.variableOverrides` is populated with variables passed via the `--var` CLI option.
      garden.variableOverrides["d"] = "from-cli-var"
      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const runAction = graph.getRun("run-a")
      const resolvedVariables = deepResolveContext("Garden and run-a action variables", runAction.getVariablesContext())
      expect(resolvedVariables).to.eql({
        a: "from-project-varfile",
        b: "from-action-vars",
        c: "from-action-varfile",
        d: "from-cli-var",
      })
    })

    it("should allow empty varfiles", async () => {
      const projectRoot = getDataDir("test-projects", "empty-varfiles")

      const garden = await makeTestGarden(projectRoot)
      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const runAction = graph.getRun("run-a")
      const runActionVariables = deepResolveContext("Run action variables", runAction.getVariablesContext())
      expect(runActionVariables).to.eql({})
    })

    it("should throw if project root is not in a git repo root", async () => {
      const dir = await tmp.dir({ unsafeCleanup: true })

      try {
        const tmpPath = await realpath(dir.path)
        await writeFile(
          join(tmpPath, "garden.yml"),
          dedent`
          apiVersion: garden.io/v2
          kind: Project
          name: foo
          environments:
            - name: local
        `
        )
        await expectError(
          async () =>
            Garden.factory(tmpPath, {
              commandInfo: { name: "test", args: {}, opts: {}, rawArgs: [], isCustomCommand: false },
              sessionId: uuidv4(),
              parentSessionId: undefined,
            }),
          {
            type: "runtime",
          }
        )
      } finally {
        await dir.cleanup()
      }
    })

    it("should set the namespace attribute, if specified", async () => {
      const projectRoot = getDataDir("test-project-empty")
      const garden = await makeTestGarden(projectRoot, { plugins: [testPlugin()], environmentString: "foo.local" })
      expect(garden.environmentName).to.equal("local")
      expect(garden.namespace).to.equal("foo")
    })

    it("should set the namespace attribute to the defaultNamespace, if applicable", async () => {
      const config: ProjectConfig = createProjectConfig({
        name: "test",
        path: pathFoo,
        environments: [{ name: "default", defaultNamespace: "foo", variables: {} }],
        providers: [{ name: "foo" }],
      })
      const garden = await TestGarden.factory(pathFoo, { config, environmentString: "default" })

      expect(garden.environmentName).to.equal("default")
      expect(garden.namespace).to.equal("foo")
    })

    it("should throw if a namespace is not specified and the specified environment requires namespacing", async () => {
      const config: ProjectConfig = createProjectConfig({
        name: "test",
        path: pathFoo,
        environments: [{ name: "default", defaultNamespace: null, variables: {} }],
        providers: [{ name: "foo" }],
      })
      await expectError(() => TestGarden.factory(pathFoo, { config, environmentString: "default" }), {
        contains:
          "Environment default has defaultNamespace set to null in the project configuration, and no explicit namespace was specified. Please either set a defaultNamespace or explicitly set a namespace at runtime (e.g. --env=some-namespace.default).",
      })
    })

    it("should optionally override project variables", async () => {
      const config: ProjectConfig = createProjectConfig({
        name: "test",
        path: pathFoo,
        environments: [{ name: "default", defaultNamespace: "foo", variables: {} }],
        providers: [{ name: "foo" }],
        variables: {
          "foo": "default",
          "bar": "something",
          "nested": {
            nestedKey1: "somevalue1",
            nestedKey2: "someValue2",
          },
          "key.withdot": "somevalue3",
        },
      })
      const garden = await TestGarden.factory(pathFoo, {
        config,
        environmentString: "default",
        variableOverrides: { "foo": "override", "nested.nestedKey2": "somevalue2new", "key.withdot": "somevalue3new" },
      })

      const variables = deepResolveContext("Garden variables", garden.variables)
      expect(variables).to.eql({
        "foo": "override",
        "bar": "something",
        "nested": {
          nestedKey1: "somevalue1",
          nestedKey2: "somevalue2new",
        },
        "key.withdot": "somevalue3new",
      })
    })

    it("should set the default proxy config if non is specified", async () => {
      const config: ProjectConfig = {
        apiVersion: GardenApiVersion.v2,
        kind: "Project",
        name: "test",
        path: pathFoo,
        internal: {
          basePath: pathFoo,
        },
        defaultEnvironment: "default",
        dotIgnoreFile: ".gitignore",
        excludeValuesFromActionVersions: [],
        remoteVariables: [],
        environments: [{ name: "default", defaultNamespace: "foo", variables: {} }],
        providers: [{ name: "foo" }],
        variables: { foo: "default", bar: "something" },
      }

      const garden = await TestGarden.factory(pathFoo, {
        config,
        environmentString: "default",
        variableOverrides: { foo: "override" },
      })

      expect(garden.proxy).to.eql({ hostname: "localhost" })
    })

    it("should optionally read the proxy config from the project config", async () => {
      const config: ProjectConfig = {
        apiVersion: GardenApiVersion.v2,
        kind: "Project",
        name: "test",
        path: pathFoo,
        internal: {
          basePath: pathFoo,
        },
        proxy: {
          hostname: "127.0.0.1", // <--- Proxy config is set here
        },
        defaultEnvironment: "default",
        dotIgnoreFile: ".gitignore",
        excludeValuesFromActionVersions: [],
        remoteVariables: [],
        environments: [{ name: "default", defaultNamespace: "foo", variables: {} }],
        providers: [{ name: "foo" }],
        variables: { foo: "default", bar: "something" },
      }

      const garden = await TestGarden.factory(pathFoo, {
        config,
        environmentString: "default",
        variableOverrides: { foo: "override" },
      })

      expect(garden.proxy).to.eql({ hostname: "127.0.0.1" })
    })

    it("should use the GARDEN_PROXY_DEFAULT_ADDRESS env variable if set", async () => {
      const saveEnv = gardenEnv.GARDEN_PROXY_DEFAULT_ADDRESS
      try {
        gardenEnv.GARDEN_PROXY_DEFAULT_ADDRESS = "example.com"
        const configNoProxy: ProjectConfig = {
          apiVersion: GardenApiVersion.v2,
          kind: "Project",
          name: "test",
          path: pathFoo,
          internal: {
            basePath: pathFoo,
          },
          defaultEnvironment: "default",
          dotIgnoreFile: ".gitignore",
          excludeValuesFromActionVersions: [],
          remoteVariables: [],
          environments: [{ name: "default", defaultNamespace: "foo", variables: {} }],
          providers: [{ name: "foo" }],
          variables: { foo: "default", bar: "something" },
        }
        const configWithProxy: ProjectConfig = {
          apiVersion: GardenApiVersion.v2,
          kind: "Project",
          name: "test",
          path: pathFoo,
          internal: {
            basePath: pathFoo,
          },
          proxy: {
            hostname: "127.0.0.1", // <--- This should be overwritten
          },
          defaultEnvironment: "default",
          dotIgnoreFile: ".gitignore",
          excludeValuesFromActionVersions: [],
          remoteVariables: [],
          environments: [{ name: "default", defaultNamespace: "foo", variables: {} }],
          providers: [{ name: "foo" }],
          variables: { foo: "default", bar: "something" },
        }

        const gardenWithProxyConfig = await TestGarden.factory(pathFoo, {
          config: configWithProxy,
          environmentString: "default",
          variableOverrides: { foo: "override" },
          noCache: true,
        })
        const gardenNoProxyConfig = await TestGarden.factory(pathFoo, {
          config: configNoProxy,
          environmentString: "default",
          variableOverrides: { foo: "override" },
          noCache: true,
        })

        expect(gardenWithProxyConfig.proxy).to.eql({ hostname: "example.com" })
        expect(gardenNoProxyConfig.proxy).to.eql({ hostname: "example.com" })
      } finally {
        gardenEnv.GARDEN_PROXY_DEFAULT_ADDRESS = saveEnv
      }
    })
    context("user is NOT logged in", () => {
      it("should have domain and id if set in project config", async () => {
        const projectId = uuidv4()
        const projectName = "test"
        const envName = "default"
        const config: ProjectConfig = createProjectConfig({
          name: projectName,
          id: projectId,
          domain: "https://example.com",
          path: pathFoo,
        })

        const garden = await TestGarden.factory(pathFoo, {
          config,
          environmentString: envName,
        })

        expect(garden.cloudDomain).to.eql("https://example.com")
        expect(garden.projectId).to.eql(projectId)
      })
      it("should use default cloud domain if not set in project config", async () => {
        const projectName = "test"
        const envName = "default"
        const config: ProjectConfig = createProjectConfig({
          name: projectName,
          path: pathFoo,
        })

        const garden = await TestGarden.factory(pathFoo, {
          config,
          environmentString: envName,
        })

        expect(garden.cloudDomain).to.eql(DEFAULT_GARDEN_CLOUD_DOMAIN)
        expect(garden.projectId).to.eql(undefined)
      })
    })

    context("user is logged in to Garden Cloud legacy (v1, projectId is set)", () => {
      let configStoreTmpDir: tmp.DirectoryResult
      const log = getRootLogger().createLog()

      const makeCloudApiLegacy = async (domain: string) => {
        const globalConfigStore = new GlobalConfigStore(configStoreTmpDir.path)
        const validityMs = 604800000
        await globalConfigStore.set("clientAuthTokens", domain, {
          token: "fake-token",
          refreshToken: "fake-refresh-token",
          validity: add(new Date(), { seconds: validityMs / 1000 }),
        })
        return GardenCloudApiLegacy.factory({
          log,
          cloudDomain: domain,
          projectId: "foo-",
          globalConfigStore,
        })
      }
      const fakeCloudDomain = "https://example.com"
      const scope = nock(fakeCloudDomain)
      const projectId = uuidv4()
      const projectName = "test"
      const envName = "default"

      const cloudProject: ProjectResult = {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        relativePathInRepo: "",
        status: ProjectStatus.Connected,
        id: projectId,
        name: projectName,
        repositoryUrl: "",
        organization: {
          id: uuidv4(),
          name: "test",
        },
        environments: [
          {
            id: uuidv4(),
            name: envName,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            projectId,
          },
        ],
      }
      const config: ProjectConfig = createProjectConfig({
        name: projectName,
        id: projectId,
        path: pathFoo,
        domain: fakeCloudDomain, // <-- Domain is set
      })

      before(async () => {
        configStoreTmpDir = await makeTempDir()
      })

      after(async () => {
        await configStoreTmpDir.cleanup()
        nock.cleanAll()
      })

      it("should use the correct API class, configured cloud domain, and fetch project", async () => {
        scope.get("/api/token/verify").reply(200, {})
        scope.get(`/api/projects/uid/${projectId}`).reply(200, { data: cloudProject })

        const overrideCloudApiFactory = async () => await makeCloudApiLegacy(fakeCloudDomain)

        const garden = await TestGarden.factory(pathFoo, {
          config,
          environmentString: envName,
          overrideCloudApiLegacyFactory: overrideCloudApiFactory,
        })

        expect(garden.cloudApiLegacy).to.exist
        expect(garden.cloudApi).to.be.undefined
        expect(garden.cloudDomain).to.eql(fakeCloudDomain)
        expect(garden.projectId).to.eql(projectId)
        expect(scope.isDone()).to.be.true
      })
      it("should fetch secrets", async () => {
        scope.get("/api/token/verify").reply(200, {})
        scope.get(`/api/projects/uid/${projectId}`).reply(200, { data: cloudProject })
        scope
          .get(`/api/secrets/projectUid/${projectId}/env/${envName}`)
          .reply(200, { data: { SECRET_KEY: "secret-val" } })

        const overrideCloudApiFactory = async () => await makeCloudApiLegacy(fakeCloudDomain)

        const garden = await TestGarden.factory(pathFoo, {
          config,
          environmentString: envName,
          overrideCloudApiLegacyFactory: overrideCloudApiFactory,
        })

        expect(garden.secrets).to.eql({ SECRET_KEY: "secret-val" })
        expect(scope.isDone()).to.be.true
      })
      it("should throw if unable to fetch project", async () => {
        scope.get("/api/token/verify").reply(200, {})
        scope.get(`/api/projects/uid/${projectId}`).reply(500, {})
        log.root["entries"] = []

        const overrideCloudApiFactory = async () => await makeCloudApiLegacy(fakeCloudDomain)

        let error: Error | undefined
        try {
          await TestGarden.factory(pathFoo, {
            config,
            environmentString: envName,
            overrideCloudApiLegacyFactory: overrideCloudApiFactory,
            log,
          })
        } catch (err) {
          if (err instanceof Error) {
            error = err
          }
        }

        const expectedLog = log.root.getLogEntries().filter((l) => resolveMsg(l)?.includes(`Fetching project with ID=`))

        expect(expectedLog.length).to.eql(1)
        expect(expectedLog[0].level).to.eql(0)
        const cleanMsg = stripAnsi(resolveMsg(expectedLog[0]) || "").replace("\n", " ")
        expect(cleanMsg).to.eql(
          `Fetching project with ID=${projectId} failed with error: HTTPError: Response code 500 (Internal Server Error)`
        )
        expect(error).to.exist
        expect(error!.message).to.eql("Response code 500 (Internal Server Error)")
        expect(scope.isDone()).to.be.true
      })
      it("should throw a helpful error if project with ID can't be found", async () => {
        scope.get("/api/token/verify").reply(200, {})
        scope.get(`/api/projects/uid/${projectId}`).reply(404, {})
        log.root["entries"] = []

        const overrideCloudApiFactory = async () => await makeCloudApiLegacy(fakeCloudDomain)

        let error: Error | undefined
        try {
          await TestGarden.factory(pathFoo, {
            config,
            environmentString: envName,
            overrideCloudApiLegacyFactory: overrideCloudApiFactory,
            log,
          })
        } catch (err) {
          if (err instanceof Error) {
            error = err
          }
        }

        const expectedLog = log.root.getLogEntries().filter((l) => resolveMsg(l)?.includes(`Project with ID=`))

        expect(expectedLog.length).to.eql(1)
        expect(expectedLog[0].level).to.eql(0)
        const cleanMsg = stripAnsi(resolveMsg(expectedLog[0]) || "")
        expect(cleanMsg).to.eql(dedent`
            Project with ID=${projectId} was not found in Garden Enterprise

            Either the project has been deleted from Garden Enterprise or the ID in the project
            level Garden config file at tmp has been changed and does not match
            one of the existing projects.

            You can view your existing projects at https://example.com/projects and
            see their ID on the Settings page for the respective project.\n
          `)
        expect(error).to.exist
        expect(error!.message).to.eql("Response code 404 (Not Found)")
        expect(scope.isDone(), "not all APIs have been called").to.be.true
      })
    })
    context("user is logged in to Garden Cloud (v2, organizationId is set)", () => {
      const log = getRootLogger().createLog()
      const envName = "default"
      const organizationId = "fake-org-id"
      const config: ProjectConfig = createProjectConfig({
        apiVersion: GardenApiVersion.v2,
        name: "test-project",
        organizationId,
        path: pathFoo,
      })
      let configStoreTmpDir: tmp.DirectoryResult

      before(async () => {
        configStoreTmpDir = await makeTempDir()
      })

      after(async () => {
        await configStoreTmpDir.cleanup()
      })

      it("should use the correct cloud API class", async () => {
        const fakeTrpcClient = {} as ApiTrpcClient
        const overrideCloudApiFactory = async () =>
          await makeFakeCloudApi({
            trpcClient: fakeTrpcClient,
            configStoreTmpDir,
            log,
          })

        const garden = await TestGarden.factory(pathFoo, {
          config,
          environmentString: envName,
          overrideCloudApiFactory,
        })

        expect(garden.cloudApi).to.exist
        expect(garden.cloudApiLegacy).to.be.undefined
      })

      it("should not attempt to fetch variables if feature flag not set", async () => {
        const fakeTrpcClient = {} as ApiTrpcClient
        const overrideCloudApiFactory = async () =>
          await makeFakeCloudApi({
            trpcClient: fakeTrpcClient,
            configStoreTmpDir,
            log,
          })

        const garden = await TestGarden.factory(pathFoo, {
          config,
          environmentString: envName,
          overrideCloudApiFactory,
        })

        expect(garden.cloudApi).to.exist
        expect(garden.cloudApiLegacy).to.be.undefined
        expect(garden.secrets).to.eql({})
      })

      // TODO: Remove this context block once variables are GA
      context("GARDEN_EXPERIMENTAL_USE_CLOUD_VARIABLES=true", () => {
        const originalVal = gardenEnv.GARDEN_EXPERIMENTAL_USE_CLOUD_VARIABLES
        before(() => {
          gardenEnv.GARDEN_EXPERIMENTAL_USE_CLOUD_VARIABLES = true
        })
        after(() => {
          gardenEnv.GARDEN_EXPERIMENTAL_USE_CLOUD_VARIABLES = originalVal
        })

        it("should have an empty secrets map if 'remoteVariables' is not set", async () => {
          const fakeTrpcClient: DeepPartial<ApiTrpcClient> = {
            variableList: {
              getValues: {
                query: async () => {
                  return {
                    variableA: {
                      value: "variable-a-val",
                      isSecret: true,
                      scopedAccountId: null,
                      scopedEnvironmentId: null,
                    },
                  }
                },
              },
            },
          }
          const overrideCloudApiFactory = async () =>
            await makeFakeCloudApi({
              trpcClient: fakeTrpcClient as ApiTrpcClient,
              configStoreTmpDir,
              log,
            })

          const garden = await TestGarden.factory(pathFoo, {
            config, // remoteVariables is not set
            environmentString: envName,
            overrideCloudApiFactory,
          })

          expect(garden.secrets).to.eql({})
        })

        it("should fetch variables if 'remoteVariables' is set", async () => {
          const fakeTrpcClient: DeepPartial<ApiTrpcClient> = {
            variableList: {
              getValues: {
                query: async () => {
                  return {
                    variableA: {
                      value: "variable-a-val",
                      isSecret: true,
                      scopedAccountId: null,
                      scopedEnvironmentId: null,
                    },
                    variableB: {
                      value: "variable-b-val",
                      isSecret: true,
                      scopedAccountId: null,
                      scopedEnvironmentId: null,
                    },
                  }
                },
              },
            },
          }
          const overrideCloudApiFactory = async () =>
            await makeFakeCloudApi({
              trpcClient: fakeTrpcClient as ApiTrpcClient,
              configStoreTmpDir,
              log,
            })

          const garden = await TestGarden.factory(pathFoo, {
            config: {
              ...config,
              remoteVariables: "varlist_1",
            },
            environmentString: envName,
            overrideCloudApiFactory,
          })

          expect(garden.secrets).to.eql({
            variableA: "variable-a-val",
            variableB: "variable-b-val",
          })
        })
        it("should log an error and throw if fetching variables fails", async () => {
          const fakeTrpcClientThatThrowsTrpcError: DeepPartial<ApiTrpcClient> = {
            variableList: {
              getValues: {
                query: async () => {
                  throw new TRPCClientError("no bueno")
                },
              },
            },
          }
          const fakeTrpcClientThatThrowsError: DeepPartial<ApiTrpcClient> = {
            variableList: {
              getValues: {
                query: async () => {
                  throw new Error("no bueno")
                },
              },
            },
          }
          const overrideCloudApiFactoryThrowTrpcError = async () =>
            await makeFakeCloudApi({
              trpcClient: fakeTrpcClientThatThrowsTrpcError as ApiTrpcClient,
              configStoreTmpDir,
              log,
            })

          const overrideCloudApiFactoryThrowError = async () =>
            await makeFakeCloudApi({
              trpcClient: fakeTrpcClientThatThrowsError as ApiTrpcClient,
              configStoreTmpDir,
              log,
            })

          getRootLogger()["entries"] = []

          await expectError(
            () =>
              TestGarden.factory(pathFoo, {
                config: {
                  ...config,
                  remoteVariables: "varlist_1",
                },
                environmentString: envName,
                overrideCloudApiFactory: overrideCloudApiFactoryThrowTrpcError,
              }),
            (err) => {
              const expectedLog = getRootLogger()
                .getLogEntries()
                .filter((l) => resolveMsg(l)?.includes(`Fetching variables for variable list 'varlist_1' failed`))
              expect(expectedLog[0].msg).to.eql(
                `Fetching variables for variable list 'varlist_1' failed with API error: no bueno`
              )
              expect(err).to.be.instanceof(GardenCloudTRPCError)
            }
          )

          getRootLogger()["entries"] = []

          await expectError(
            () =>
              TestGarden.factory(pathFoo, {
                config: {
                  ...config,
                  remoteVariables: "varlist_1",
                },
                environmentString: envName,
                overrideCloudApiFactory: overrideCloudApiFactoryThrowError,
              }),
            (err) => {
              const expectedLog = getRootLogger()
                .getLogEntries()
                .filter((l) => resolveMsg(l)?.includes(`Fetching variables for variable list 'varlist_1' failed`))
              expect(expectedLog[0].msg).to.eql(
                `Fetching variables for variable list 'varlist_1' failed with Error error: no bueno`
              )
              expect(err).to.be.instanceof(Error)
            }
          )
        })
      })
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
            needsBuild: true,
            handlers: {
              convert: async ({}) => ({}),
            },
          },
        ],
      })
      const foo = createGardenPlugin({
        name: "foo",
        dependencies: [{ name: "base" }],
        extendModuleTypes: [
          {
            name: "foo",
            needsBuild: true,
            handlers: {
              convert: async ({}) => ({}),
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
      const convertHandler = extended.handlers.convert!
      expect(convertHandler).to.exist
      expect(convertHandler.base).to.exist
      expect(convertHandler.base!.handlerType).to.equal("convert")
      expect(convertHandler.base!.pluginName).to.equal("base")
      expect(convertHandler.base!.base).to.not.exist
    })

    it("should throw if plugin module exports invalid name", async () => {
      const pluginPath = join(moduleDirName, "plugins", "invalid-name.js")
      const plugins = [pluginPath]
      const projectRoot = getDataDir("test-project-empty")
      const garden = await makeTestGarden(projectRoot, { plugins })
      await expectError(() => garden.getAllPlugins(), {
        contains: [
          "Unable to load plugin",
          `Error validating plugin module "${pluginPath}"`,
          "gardenPlugin must be of type object",
        ],
      })
    })

    it("should throw if plugin module doesn't contain plugin", async () => {
      const pluginPath = join(moduleDirName, "plugins", "missing-plugin.js")
      const plugins = [pluginPath]
      const projectRoot = getDataDir("test-project-empty")
      const garden = await makeTestGarden(projectRoot, { plugins })
      await expectError(() => garden.getAllPlugins(), {
        contains: [
          "Unable to load plugin",
          `Error validating plugin module "${pluginPath}"`,
          "gardenPlugin is required",
        ],
      })
    })

    it("should throw if multiple plugins declare the same module type", async () => {
      const testPluginDupe = {
        ...testPlugin(),
        name: "test-plugin-dupe",
      }
      const garden = await makeTestGardenA([testPluginDupe])

      garden["providerConfigs"].push(new UnresolvedProviderConfig("test-plugin-dupe", [], { name: "test-plugin-dupe" }))

      await expectError(() => garden.getAllPlugins(), {
        contains: "Module type 'test' is declared in multiple plugins: test-plugin, test-plugin-dupe.",
      })
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
              needsBuild: true,
              handlers: {
                configure: async ({ moduleConfig }) => ({ moduleConfig }),
              },
            },
          ],
        })
        const baseB = createGardenPlugin({
          name: "base-b",
          dependencies: [{ name: "base-a" }],
          createModuleTypes: [
            {
              name: "foo-b",
              base: "foo-a",
              docs: "Foo B",
              schema: baseModuleSpecSchema(),
              needsBuild: true,
              handlers: {
                convert: async ({}) => ({}),
              },
            },
          ],
        })
        const foo = createGardenPlugin({
          name: "foo",
          dependencies: [{ name: "base-b" }],
          createModuleTypes: [
            {
              name: "foo-c",
              base: "foo-b",
              docs: "Foo C",
              schema: baseModuleSpecSchema().keys({ taskOutput: joi.string() }),
              needsBuild: true,
              handlers: {
                configure: async ({ moduleConfig }) => ({ moduleConfig }),
                convert: async ({}) => ({}),
                getModuleOutputs: async () => {
                  return { outputs: { foo: "bar" } }
                },
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

        // Make sure handlers are correctly inherited and bases set
        const configureHandler = spec.handlers.configure!
        expect(configureHandler).to.exist
        expect(configureHandler.base).to.exist
        expect(configureHandler.base!.handlerType).to.equal("configure")
        expect(configureHandler.base!.pluginName).to.equal("base-a")
        expect(configureHandler.base!.base).to.not.exist

        const convertHandler = spec.handlers.convert!
        expect(convertHandler).to.exist
        expect(convertHandler.base).to.exist
        expect(convertHandler.base!.handlerType).to.equal("convert")
        expect(convertHandler.base!.pluginName).to.equal("base-b")
        expect(convertHandler.base!.base).to.not.exist

        const getModuleOutputsHandler = spec.handlers.getModuleOutputs!
        expect(getModuleOutputsHandler).to.exist
        expect(getModuleOutputsHandler.base).to.not.exist
      })

      it("should throw when a module type has a base that is not defined", async () => {
        const foo = createGardenPlugin({
          name: "foo",
          createModuleTypes: [
            {
              name: "foo",
              docs: "foo",
              base: "bar",
              needsBuild: true,
              handlers: {},
            },
          ],
        })

        const garden = await TestGarden.factory(pathFoo, {
          plugins: [foo],
          config: projectConfigFoo,
        })

        await expectError(() => garden.getAllPlugins(), {
          contains: [
            "Module type 'foo', defined in plugin 'foo', specifies base module type 'bar' which cannot be found.",
            "The plugin is likely missing a dependency declaration. Please report an issue with the author.",
          ],
        })
      })

      it("should throw when a module type has a base that is not declared in the plugin's dependencies", async () => {
        const base = createGardenPlugin({
          name: "base",
          createModuleTypes: [
            {
              name: "bar",
              docs: "bar",
              needsBuild: true,
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
              needsBuild: true,
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

        await expectError(() => garden.getAllPlugins(), {
          contains: [
            "Module type 'foo', defined in plugin 'foo', specifies base module type 'bar' which is defined by 'base'",
            "but 'foo' does not specify a dependency on that plugin. Plugins must explicitly declare dependencies on",
            "plugins that define module types they reference. Please report an issue with the author.",
          ],
        })
      })

      it("should throw on circular module type base definitions", async () => {
        const foo = createGardenPlugin({
          name: "foo",
          createModuleTypes: [
            {
              name: "foo",
              docs: "foo",
              base: "bar",
              needsBuild: true,
              handlers: {},
            },
            {
              name: "bar",
              docs: "bar",
              base: "foo",
              needsBuild: true,
              handlers: {},
            },
          ],
        })

        const garden = await TestGarden.factory(pathFoo, {
          plugins: [foo],
          config: projectConfigFoo,
        })

        await expectError(() => garden.getAllPlugins(), {
          contains: [
            "Found circular dependency between module type",
            "bases:",
            "foo (from plugin foo) <- bar (from plugin foo) <- foo (from plugin foo)",
          ],
        })
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
          dependencies: [{ name: "test-plugin" }, { name: "test-plugin-b" }],
        })
        const foo = createGardenPlugin({
          name: "foo",
          dependencies: [{ name: "test-plugin-b" }, { name: "test-plugin-c" }],
          base: "base",
        })

        const garden = await TestGarden.factory(pathFoo, {
          plugins: [depA, depB, depC, base, foo],
          config: projectConfigFoo,
        })

        const parsed = await garden.getPlugin("foo")

        expect(parsed.dependencies.map((d) => d.name)).to.eql(["test-plugin", "test-plugin-b", "test-plugin-c"])
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
        expect(parsed.handlers.configureProvider!.base!.handlerType).to.equal("configureProvider")
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
              resolveGraph: false,
              hidden: false,
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
              hidden: false,
              handler: () => ({ result: {} }),
              resolveGraph: false,
            },
            {
              name: "bar",
              description: "bar",
              hidden: false,
              handler: () => ({ result: {} }),
              resolveGraph: false,
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
              version: "foo",
              type: "binary",
              _includeInGardenImage: false,
              description: "Test",
              builds: [],
            },
            {
              name: "common-tool",
              version: "foo",
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
              version: "foo",
              type: "library",
              _includeInGardenImage: false,
              description: "Different description",
              builds: [],
            },
            {
              name: "different-tool",
              version: "foo",
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
              needsBuild: true,
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
              needsBuild: true,
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
              needsBuild: true,
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

        await expectError(() => garden.getAllPlugins(), {
          contains: "Plugin 'foo' redeclares the 'foo' module type, already declared by its base",
        })
      })

      it("should allow extending a module type from the base", async () => {
        const base = createGardenPlugin({
          name: "base",
          createModuleTypes: [
            {
              name: "foo",
              docs: "foo",
              schema: joi.object(),
              needsBuild: true,
              handlers: {
                convert: async ({}) => ({}),
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
              needsBuild: true,
              handlers: {
                convert: async ({}) => ({}),
                configure: async ({ moduleConfig }) => ({ moduleConfig }),
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
              needsBuild: true,
              handlers: {
                convert: async ({}) => ({}),
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
              needsBuild: true,
              handlers: {
                convert: async ({}) => ({}),
                configure: async ({ moduleConfig }) => ({ moduleConfig }),
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

        await expectError(() => garden.getAllPlugins(), {
          contains: "Plugin 'foo' specifies plugin 'base' as a base, but that plugin has not been registered.",
        })
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

        await expectError(() => garden.getAllPlugins(), {
          contains: ["Found a circular dependency between registered plugins:", "foo <- bar <- foo"],
        })
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
            dependencies: [{ name: "test-plugin" }],
          })
          const b = createGardenPlugin({
            name: "b",
            dependencies: [{ name: "test-plugin" }, { name: "test-plugin-b" }],
            base: "base-a",
          })
          const foo = createGardenPlugin({
            name: "foo",
            dependencies: [{ name: "test-plugin-c" }],
            base: "b",
          })

          const garden = await TestGarden.factory(pathFoo, {
            plugins: [depA, depB, depC, baseA, b, foo],
            config: projectConfigFoo,
          })

          const parsed = await garden.getPlugin("foo")

          expect(parsed.dependencies.map((d) => d.name)).to.eql(["test-plugin", "test-plugin-b", "test-plugin-c"])
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
                needsBuild: true,
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
                needsBuild: true,
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
                needsBuild: true,
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
                needsBuild: true,
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
                needsBuild: true,
                handlers: {},
              },
            ],
          })

          const garden = await TestGarden.factory(pathFoo, {
            plugins: [baseA, baseB, foo],
            config: projectConfigFoo,
          })

          await expectError(() => garden.getAllPlugins(), {
            contains: "Plugin 'foo' redeclares the 'foo' module type, already declared by its base",
          })
        })

        it("should allow extending module types from the base's base", async () => {
          const baseA = createGardenPlugin({
            name: "base-a",
            createModuleTypes: [
              {
                name: "foo",
                docs: "foo",
                schema: joi.object(),
                needsBuild: true,
                handlers: {
                  convert: async ({}) => ({}),
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
                needsBuild: true,
                handlers: {
                  convert: async ({}) => ({}),
                  configure: async ({ moduleConfig }) => ({ moduleConfig }),
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
                needsBuild: true,
                handlers: {
                  convert: async ({}) => ({}),
                },
              },
            ],
          })
          const baseB = createGardenPlugin({
            name: "base-b",
            base: "base-a",
            dependencies: [{ name: "base-a" }],
            extendModuleTypes: [
              {
                name: "foo",
                needsBuild: true,
                handlers: {
                  convert: async ({}) => ({}),
                },
              },
            ],
          })
          const baseC = createGardenPlugin({
            name: "base-c",
            base: "base-b",
            dependencies: [{ name: "base-a" }],
            extendModuleTypes: [
              {
                name: "foo",
                needsBuild: true,
                handlers: {
                  configure: async ({ moduleConfig }) => ({ moduleConfig }),
                  convert: async ({}) => ({}),
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

          const configureHandler = fooExtension.handlers.configure!
          expect(configureHandler).to.exist

          const convertHandler = fooExtension.handlers.convert!
          expect(convertHandler).to.exist
          expect(convertHandler.base).to.exist
          expect(convertHandler.base!.handlerType).to.equal("convert")
          expect(convertHandler.base!.pluginName).to.equal("base-a")
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

          await expectError(() => garden.getAllPlugins(), {
            contains: ["Found a circular dependency between registered plugins:", "base-a <- foo <- base-b <- base-a"],
          })
        })
      })
    })
  })

  describe("resolveProviders", () => {
    it("should throw when plugins are missing", async () => {
      const garden = await TestGarden.factory(pathFoo, {
        config: createProjectConfig({
          name: "test",
          path: pathFoo,
          providers: [{ name: "test-plugin" }],
        }),
      })

      await expectError(() => garden.resolveProviders({ log: garden.log }), {
        contains: "Configured provider 'test-plugin' has not been registered.",
      })
    })

    it("should pass through a basic provider config", async () => {
      const garden = await makeTestGardenA()
      const projectRoot = garden.projectRoot

      const testPluginProvider = {
        name: "test-plugin",
        config: {
          name: "test-plugin",
          dependencies: [],
          path: projectRoot,
        },
        dependencies: [],
        moduleConfigs: [],
        status: {
          ready: true,
          outputs: {},
        },
      }

      const providers = await garden.resolveProviders({ log: garden.log })
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
      const projectConfig: ProjectConfig = createProjectConfig({
        name: "test",
        path: pathFoo,
        providers: [{ name: "test", foo: "bar" }],
      })

      const test = createGardenPlugin({
        name: "test",
        handlers: {
          async configureProvider({ config }: ConfigureProviderParams) {
            expect(config).to.eql({
              name: "test",
              dependencies: [],
              foo: "bar",
            })
            return { config: { ...config, foo: "bla" } }
          },
        },
      })

      const garden = await makeTestGarden(projectConfig.path, {
        plugins: [test],
        config: projectConfig,
      })

      const provider = await garden.resolveProvider({ log: garden.log, name: "test" })

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

      const projectConfig: ProjectConfig = createProjectConfig({
        name: "test",
        path: projectRootA,
        providers: [{ name: "test", foo: "${bla.ble}" }],
      })

      const garden = await makeTestGarden(projectRootA, { config: projectConfig, plugins: [test] })
      await expectError(
        () => garden.resolveProviders({ log: garden.log }),
        (err) => {
          expectFuzzyMatch(err.toString(), ["Failed resolving one or more providers:", "- test"])
        }
      )
    })

    it("should throw if providers reference non-existent providers in template strings", async () => {
      const test = createGardenPlugin({
        name: "test",
      })

      const projectConfig: ProjectConfig = createProjectConfig({
        name: "test",
        path: projectRootA,
        providers: [{ name: "test", foo: "${providers.foo.config.bla}" }],
      })
      const garden = await makeTestGarden(projectRootA, { config: projectConfig, plugins: [test] })
      await expectError(() => garden.resolveProviders({ log: garden.log }))
    })

    it("should add plugin modules if returned by the provider", async () => {
      const pluginModule: ModuleConfig = makeModuleConfig(projectRootA, {
        name: "foo",
        type: "exec",
      })

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
            needsBuild: true,
            handlers: {},
          },
        ],
        createActionTypes: getEmptyPluginActionDefinitions("test"),
      })

      const projectConfig: ProjectConfig = createProjectConfig({
        name: "test",
        path: projectRootA,
        providers: [{ name: "test", foo: "bar" }],
      })

      const garden = await makeTestGarden(projectRootA, { config: projectConfig, plugins: [test] })

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      expect(graph.getModule("foo")).to.exist
    })

    it("should throw if plugins have declared circular dependencies", async () => {
      const testA = createGardenPlugin({
        name: "test-a",
        dependencies: [{ name: "test-b" }],
      })

      const testB = createGardenPlugin({
        name: "test-b",
        dependencies: [{ name: "test-a" }],
      })

      const projectConfig: ProjectConfig = createProjectConfig({
        name: "test",
        path: projectRootA,
        providers: [{ name: "test-a" }, { name: "test-b" }],
      })

      const plugins = [testA, testB]
      const garden = await makeTestGarden(projectRootA, { config: projectConfig, plugins })

      await expectError(() => garden.resolveProviders({ log: garden.log }), {
        contains: ["Found a circular dependency between registered plugins:", "test-a <- test-b <- test-a"],
      })
    })

    it("should throw if plugins reference themselves as dependencies", async () => {
      const testA = createGardenPlugin({
        name: "test-a",
        dependencies: [{ name: "test-a" }],
      })

      const projectConfig: ProjectConfig = createProjectConfig({
        name: "test",
        path: projectRootA,
        providers: [{ name: "test-a" }],
      })

      const garden = await makeTestGarden(projectRootA, { config: projectConfig, plugins: [testA] })

      await expectError(() => garden.resolveProviders({ log: garden.log }), {
        contains: ["Found a circular dependency between registered plugins:", "test-a <- test-a"],
      })
    })

    it("should throw if provider configs have implicit circular dependencies", async () => {
      const testA = createGardenPlugin({
        name: "test-a",
      })
      const testB = createGardenPlugin({
        name: "test-b",
      })

      const projectConfig: ProjectConfig = createProjectConfig({
        name: "test",
        path: projectRootA,
        providers: [
          { name: "test-a", foo: "${providers.test-b.outputs.foo}" },
          { name: "test-b", foo: "${providers.test-a.outputs.foo}" },
        ],
      })

      const plugins = [testA, testB]
      const garden = await makeTestGarden(projectRootA, { config: projectConfig, plugins })

      await expectError(() => garden.resolveProviders({ log: garden.log }), {
        contains: [
          "One or more circular dependencies found between providers or their configurations:",
          "test-a <- test-b <- test-a",
        ],
      })
    })

    it("should throw if provider configs have combined implicit and declared circular dependencies", async () => {
      const testA = createGardenPlugin({
        name: "test-a",
      })

      const testB = createGardenPlugin({
        name: "test-b",
      })

      const projectConfig: ProjectConfig = createProjectConfig({
        name: "test",
        path: projectRootA,
        providers: [
          { name: "test-a", foo: "${providers.test-b.outputs.foo}" },
          { name: "test-b", dependencies: ["test-a"] },
        ],
      })

      const plugins = [testA, testB]
      const garden = await makeTestGarden(projectRootA, { config: projectConfig, plugins })

      await expectError(() => garden.resolveProviders({ log: garden.log }), {
        contains: [
          "One or more circular dependencies found between providers or their",
          "configurations:",
          "test-a <- test-b <- test-a",
        ],
      })
    })

    it("should throw if provider configs have combined implicit and plugin circular dependencies", async () => {
      const testA = createGardenPlugin({
        name: "test-a",
      })

      const testB = createGardenPlugin({
        name: "test-b",
        dependencies: [{ name: "test-a" }],
      })

      const projectConfig: ProjectConfig = createProjectConfig({
        name: "test",
        path: projectRootA,
        providers: [{ name: "test-a", foo: "${providers.test-b.outputs.foo}" }, { name: "test-b" }],
      })

      const plugins = [testA, testB]
      const garden = await makeTestGarden(projectRootA, { config: projectConfig, plugins })

      await expectError(() => garden.resolveProviders({ log: garden.log }), {
        contains: [
          "One or more circular dependencies found between providers or their",
          "configurations:",
          "test-a <- test-b <- test-a",
        ],
      })
    })

    it("should apply default values from a plugin's configuration schema if specified", async () => {
      const test = createGardenPlugin({
        name: "test",
        configSchema: providerConfigBaseSchema().keys({
          foo: joi.string().default("bar"),
        }),
      })

      const projectConfig: ProjectConfig = createProjectConfig({
        name: "test",
        path: projectRootA,
        providers: [{ name: "test" }],
      })

      const garden = await makeTestGarden(projectRootA, { config: projectConfig, plugins: [test] })
      const providers = keyBy(await garden.resolveProviders({ log: garden.log }), "name")

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

      const projectConfig: ProjectConfig = createProjectConfig({
        name: "test",
        path: projectRootA,
        providers: [{ name: "test", foo: 123 }],
      })

      const garden = await makeTestGarden(projectRootA, { config: projectConfig, plugins: [test] })

      await expectError(
        () => garden.resolveProviders({ log: garden.log }),
        (err) => {
          expectFuzzyMatch(err.toString(true), [
            "Failed resolving one or more providers:",
            "- test",
            "Error validating provider configuration",
            "foo must be a string",
          ])
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

      const projectConfig: ProjectConfig = createProjectConfig({
        name: "test",
        path: projectRootA,
        providers: [{ name: "test" }],
      })

      const garden = await makeTestGarden(projectRootA, { config: projectConfig, plugins: [test] })

      await expectError(
        () => garden.resolveProviders({ log: garden.log }),
        (err) => {
          expectFuzzyMatch(err.toString(true), [
            "Failed resolving one or more providers:",
            "- test",
            "Error validating provider configuration",
            "foo must be a string",
          ])
        }
      )
    })

    it("should allow providers to reference each others' outputs", async () => {
      const testA = createGardenPlugin({
        name: "test-a",
        handlers: {
          prepareEnvironment: async () => {
            return {
              status: {
                ready: true,
                outputs: { foo: "bar" },
              },
            }
          },
        },
      })

      const testB = createGardenPlugin({
        name: "test-b",
      })

      const projectConfig: ProjectConfig = createProjectConfig({
        name: "test",
        path: projectRootA,
        providers: [{ name: "test-a" }, { name: "test-b", foo: "${providers.test-a.outputs.foo}" }],
      })

      const plugins = [testA, testB]
      const garden = await makeTestGarden(projectRootA, { config: projectConfig, plugins })

      const providerB = await garden.resolveProvider({ log: garden.log, name: "test-b" })

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

      const projectConfig: ProjectConfig = createProjectConfig({
        name: "test",
        path: projectRootA,
        defaultEnvironment: "dev",
        environments: [
          { name: "dev", defaultNamespace, variables: {} },
          { name: "prod", defaultNamespace, variables: {} },
        ],
        providers: [
          { name: "test-a", environments: ["prod"] },
          { name: "test-b", foo: "${providers.test-a.outputs.foo || 'default'}" },
        ],
      })

      const plugins = [testA, testB]
      const garden = await makeTestGarden(projectRootA, { config: projectConfig, plugins })

      const providerB = await garden.resolveProvider({ log: garden.log, name: "test-b" })

      expect(providerB.config["foo"]).to.equal("default")
    })

    it("should allow providers to reference variables", async () => {
      const testA = createGardenPlugin({
        name: "test-a",
      })

      const projectConfig: ProjectConfig = createProjectConfig({
        name: "test",
        path: projectRootA,
        environments: [{ name: "default", defaultNamespace, variables: { "my-variable": "bar" } }],
        providers: [{ name: "test-a", foo: "${var.my-variable}" }],
      })

      const plugins = [testA]
      const garden = await makeTestGarden(projectRootA, { config: projectConfig, plugins })

      const providerB = await garden.resolveProvider({ log: garden.log, name: "test-a" })

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
        dependencies: [{ name: "base-a" }],
      })

      const projectConfig: ProjectConfig = createProjectConfig({
        name: "test",
        path: projectRootA,
        providers: [{ name: "test-a" }, { name: "test-b" }],
      })

      const plugins = [baseA, testA, testB]
      const garden = await makeTestGarden(projectRootA, { config: projectConfig, plugins })

      const providerA = await garden.resolveProvider({ log: garden.log, name: "test-a" })
      const providerB = await garden.resolveProvider({ log: garden.log, name: "test-b" })

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
        dependencies: [{ name: "base-a" }],
      })

      const projectConfig: ProjectConfig = createProjectConfig({
        name: "test",
        path: projectRootA,
        providers: [{ name: "test-a" }, { name: "test-b" }, { name: "test-c" }],
      })

      const plugins = [baseA, testA, testB, testC]
      const garden = await makeTestGarden(projectRootA, { config: projectConfig, plugins })

      const providerA = await garden.resolveProvider({ log: garden.log, name: "test-a" })
      const providerB = await garden.resolveProvider({ log: garden.log, name: "test-b" })
      const providerC = await garden.resolveProvider({ log: garden.log, name: "test-c" })

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

        const projectConfig: ProjectConfig = createProjectConfig({
          name: "test",
          path: projectRootA,
          providers: [{ name: "test", foo: 123 }],
        })

        const garden = await makeTestGarden(projectRootA, { config: projectConfig, plugins: [base, test] })

        await expectError(
          () => garden.resolveProviders({ log: garden.log }),
          (err) => {
            expectFuzzyMatch(err.toString(true), [
              "Failed resolving one or more providers:",
              "- test",
              "Error validating provider configuration",
              "foo must be a string",
            ])
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

        const projectConfig: ProjectConfig = createProjectConfig({
          name: "test",
          path: projectRootA,
          providers: [{ name: "test" }],
        })

        const garden = await makeTestGarden(projectRootA, { config: projectConfig, plugins: [base, test] })

        await expectError(
          () => garden.resolveProviders({ log: garden.log }),
          (err) => {
            expectFuzzyMatch(err.toString(true), [
              "Failed resolving one or more providers:",
              "- test",
              "Error validating provider configuration",
              "base schema from 'base' plugin",
              "foo must be a string",
            ])
          }
        )
      })
    })
  })

  describe("getProjectSources", () => {
    it("should correctly resolve template strings in remote source configs", async () => {
      const remoteTag = "feature-branch"
      process.env.TEST_ENV_VAR = "foo"
      const garden = await TestGarden.factory(pathFoo, {
        config: createProjectConfig({
          name: "test",
          path: pathFoo,
          environments: [{ name: "default", defaultNamespace, variables: { remoteTag } }],
          providers: [{ name: "test-plugin" }],
          variables: { sourceName: "${local.env.TEST_ENV_VAR}" },
          sources: [
            {
              name: "${var.sourceName}",
              repositoryUrl: "git://github.com/foo/bar.git#${var.remoteTag}",
            },
          ],
        }),
      })

      const sources = garden.getProjectSources()

      expect(sources).to.eql([{ name: "foo", repositoryUrl: "git://github.com/foo/bar.git#feature-branch" }])

      delete process.env.TEST_ENV_VAR
    })

    it("should validate the resolved remote sources", async () => {
      const remoteTag = "feature-branch"
      process.env.TEST_ENV_VAR = "foo"
      const garden = await TestGarden.factory(pathFoo, {
        config: createProjectConfig({
          name: "test",
          path: pathFoo,
          environments: [{ name: "default", defaultNamespace, variables: { remoteTag } }],
          providers: [{ name: "test-plugin" }],
          variables: { sourceName: 123 },
          sources: [
            {
              name: "${var.sourceName}",
              repositoryUrl: "git://github.com/foo/bar.git#${var.remoteTag}",
            },
          ],
        }),
      })

      await expectError(() => garden.getProjectSources(), {
        contains: ["Error validating remote source:", "[0][name] must be a string"],
      })

      delete process.env.TEST_ENV_VAR
    })
  })

  describe("scanForConfigs", () => {
    it("should find all garden configs in the project directory", async () => {
      const garden = await makeTestGardenA()
      const files = await garden.scanForConfigs(garden.log, garden.projectRoot)
      expect(files).to.eql([
        join(garden.projectRoot, "commands.garden.yml"),
        join(garden.projectRoot, "garden.yml"),
        join(garden.projectRoot, "module-a", "garden.yml"),
        join(garden.projectRoot, "module-b", "garden.yml"),
        join(garden.projectRoot, "module-c", "garden.yml"),
      ])
    })

    it("should respect the include option, if specified", async () => {
      const garden = await makeTestGardenA()
      set(garden, "moduleIncludePatterns", ["module-a/**/*"])
      const files = await garden.scanForConfigs(garden.log, garden.projectRoot)
      expect(files).to.eql([join(garden.projectRoot, "module-a", "garden.yml")])
    })

    it("should respect the exclude option, if specified", async () => {
      const garden = await makeTestGardenA()
      set(garden, "moduleExcludePatterns", ["module-a/**/*"])
      const files = await garden.scanForConfigs(garden.log, garden.projectRoot)
      expect(files).to.eql([
        join(garden.projectRoot, "commands.garden.yml"),
        join(garden.projectRoot, "garden.yml"),
        join(garden.projectRoot, "module-b", "garden.yml"),
        join(garden.projectRoot, "module-c", "garden.yml"),
      ])
    })

    it("should respect the include and exclude options, if both are specified", async () => {
      const garden = await makeTestGardenA()
      set(garden, "moduleIncludePatterns", ["module*/**/*"])
      set(garden, "moduleExcludePatterns", ["module-a/**/*"])
      const files = await garden.scanForConfigs(garden.log, garden.projectRoot)
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
      const garden = await makeTestGarden(getDataDir("test-projects", "multiple-module-config"))
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
      const garden = await makeTestGarden(getDataDir("test-projects", "custom-config-names"))
      await garden.scanAndAddConfigs()

      const modules = await garden.resolveModules({ log: garden.log })
      expect(getNames(modules).sort()).to.eql(["module-a", "module-b"])
    })

    it("should scan and add workflows contained in custom-named config files", async () => {
      const garden = await makeTestGarden(getDataDir("test-projects", "custom-config-names"))
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
      const garden = await makeTestGarden(getDataDir("test-projects", "ext-project-sources"))
      const sourcesPath = join(garden.gardenDirPath, "sources")

      if (await pathExists(sourcesPath)) {
        await remove(sourcesPath)
        await mkdirp(sourcesPath)
      }

      const localSourcePath = getDataDir("test-projects", "local-project-sources", "source-a")
      const _tmpDir = await makeTempDir()

      try {
        // Create a temporary git repo to clone
        const repoPath = resolve(_tmpDir.path, garden.projectName)
        await copy(localSourcePath, repoPath)
        await exec("git", ["init", "--initial-branch=main"], { cwd: repoPath })
        await exec("git", ["add", "."], { cwd: repoPath })
        await exec("git", ["commit", "-m", "foo"], { cwd: repoPath })

        garden.variables = VariablesContext.forTest({ garden, variablePrecedence: [{ sourceBranch: "main" }] })

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const _garden = garden as any
        _garden["projectSources"] = parseTemplateCollection({
          value: [
            {
              name: "source-a",
              // Use a couple of template strings in the repo path
              repositoryUrl: "file://" + _tmpDir.path + "/${project.name}#${var.sourceBranch}",
            },
          ],
          source: { path: [] },
        })

        await garden.scanAndAddConfigs()

        const modules = await garden.resolveModules({ log: garden.log })
        expect(getNames(modules).sort()).to.eql(["module-a"])
      } finally {
        await _tmpDir.cleanup()
      }
    })

    it("should resolve modules from config templates and any modules referencing them", async () => {
      const garden = await makeTestGarden(getDataDir("test-projects", "module-templates"))
      await garden.scanAndAddConfigs()

      const configA = (await garden.getRawModuleConfigs(["foo-test-a"]))[0]
      const configB = (await garden.getRawModuleConfigs(["foo-test-b"]))[0]

      // note that module config versions should default to v0 (previous version)
      expect(serialiseUnresolvedTemplates(omitUndefined(configA))).to.eql({
        apiVersion: GardenApiVersion.v0,
        kind: "Module",
        build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
        include: [],
        configPath: resolve(garden.projectRoot, "modules.garden.yml"),
        name: "foo-test-a",
        path: garden.projectRoot,
        serviceConfigs: [],
        spec: {
          build: {
            command: ["${inputs.value}"],
            dependencies: [],
          },
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
      expect(serialiseUnresolvedTemplates(omitUndefined(configB))).to.eql({
        apiVersion: GardenApiVersion.v0,
        kind: "Module",
        build: { dependencies: ["${parent.name}-${inputs.name}-a"], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
        include: [],
        configPath: resolve(garden.projectRoot, "modules.garden.yml"),
        name: "foo-test-b",
        path: garden.projectRoot,
        serviceConfigs: [],
        spec: {
          build: {
            dependencies: ["${parent.name}-${inputs.name}-a"],
          },
        },
        testConfigs: [],
        type: "test",
        taskConfigs: [],
        generateFiles: [
          {
            targetPath: "module-b.log",
            sourcePath: resolve(garden.projectRoot, "source.txt"),
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

    it("should correctly resolve module paths in module templates", async () => {
      const garden = await makeTestGarden(getDataDir("test-projects", "module-templates-path-handling"))
      await garden.scanAndAddConfigs()

      const configA = (await garden.getRawModuleConfigs(["gen-files-module-a"]))[0]
      const configB = (await garden.getRawModuleConfigs(["gen-files-module-b"]))[0]

      // note that module config versions should default to v0 (previous version)
      expect(serialiseUnresolvedTemplates(omitUndefined(configA))).to.eql({
        apiVersion: GardenApiVersion.v0,
        kind: "Module",
        build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
        include: [],
        configPath: resolve(garden.projectRoot, "modules.garden.yml"),
        name: "gen-files-module-a",
        path: resolve(garden.projectRoot, "module-a"),
        serviceConfigs: [],
        spec: {
          build: {
            command: ["echo", "hello"],
            dependencies: [],
          },
        },
        testConfigs: [],
        type: "exec",
        taskConfigs: [],
        generateFiles: [
          {
            sourcePath: resolve(garden.projectRoot, "source.txt"),
            targetPath: "rendered.log",
          },
        ],
        parentName: "module-a",
        templateName: "gen-files",
        inputs: {
          name: "module-a",
          value: "test",
        },
      })
      expect(serialiseUnresolvedTemplates(omitUndefined(configB))).to.eql({
        apiVersion: GardenApiVersion.v0,
        kind: "Module",
        build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
        include: [],
        configPath: resolve(garden.projectRoot, "modules.garden.yml"),
        name: "gen-files-module-b",
        path: resolve(garden.projectRoot, "module-b"),
        serviceConfigs: [],
        spec: {
          build: {
            command: ["echo", "hello"],
            dependencies: [],
          },
        },
        testConfigs: [],
        type: "exec",
        taskConfigs: [],
        generateFiles: [
          {
            targetPath: "rendered.log",
            sourcePath: resolve(garden.projectRoot, "source.txt"),
          },
        ],
        parentName: "module-b",
        templateName: "gen-files",
        inputs: {
          name: "module-b",
          value: "test",
        },
      })
    })

    it("should resolve actions from config templates", async () => {
      const garden = await makeTestGarden(getDataDir("test-projects", "config-templates"))
      await garden.scanAndAddConfigs()

      const configs = await garden.getRawActionConfigs()

      const build = configs.Build["foo-test"]
      const deploy = configs.Deploy["foo-test"]
      const test = configs.Test["foo-test"]

      const expectedInternal = {
        basePath: garden.projectRoot,
        configFilePath: join(garden.projectRoot, "actions.garden.yml"),
        parentName: "foo",
        templateName: "combo",
        inputs: {
          name: "test",
          envName: "${environment.name}",
          providerKey: "${providers.test-plugin.outputs.testKey}",
        },
      }

      expect(build).to.exist
      expect(deploy).to.exist
      expect(test).to.exist

      expect(build.type).to.equal("test")
      expect(serialiseUnresolvedTemplates(build.spec.command)).to.eql(["echo", "echo-prefix", "${inputs.name}"])
      expect(serialiseUnresolvedTemplates(omit(build.internal, "yamlDoc"))).to.eql(expectedInternal)

      expect(serialiseUnresolvedTemplates(deploy["build"])).to.equal("${parent.name}-${inputs.name}")
      expect(serialiseUnresolvedTemplates(omit(deploy.internal, "yamlDoc"))).to.eql(expectedInternal)

      expect(serialiseUnresolvedTemplates(test.dependencies)).to.eql(["build.${parent.name}-${inputs.name}"])
      expect(serialiseUnresolvedTemplates(test.spec.command)).to.eql([
        "echo",
        "${inputs.envName}",
        "${inputs.providerKey}",
      ])
      expect(serialiseUnresolvedTemplates(omit(test.internal, "yamlDoc"))).to.eql(expectedInternal)
    })

    it("should resolve disabled flag in actions and allow two actions with same key if one is disabled", async () => {
      const garden = await makeTestGarden(getDataDir("test-projects", "disabled-action-with-duplicate-name"))
      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })

      // There are 2 'run-script' actions defined in the project, one per environment.
      // This test uses 'local' environment, so the action for 'remote' environment should be disabled and skipped.
      const runScript = graph.getRun("run-script")
      expect(runScript.isDisabled()).to.be.false
      expect(runScript.getConfig().spec.command).to.eql(["sh", "-c", "echo 'Hello from local'"])
    })

    it("should deny variables context in disabled flag for actions with duplicate names", async () => {
      const garden = await makeTestGarden(getDataDir("test-projects", "disabled-action-with-var-context"))

      // There are 2 'run-script' actions defined in the project, one per environment.
      await expectError(() => garden.getConfigGraph({ log: garden.log, emit: false }), {
        contains: [
          "If you have duplicate action names",
          "the",
          "disabled",
          "flag cannot depend on the",
          "var",
          "context",
        ],
      })
    })

    it("should resolve actions from templated config templates", async () => {
      const garden = await makeTestGarden(getDataDir("test-projects", "config-templates-with-templating"))
      await garden.scanAndAddConfigs()

      const configs = await garden.getRawActionConfigs()
      const runs = configs.Run
      expect(runs).to.be.not.empty

      const runNameA = "run-a"
      const runA = runs[runNameA] as RunActionConfig
      expect(runA).to.exist

      const runNameB = "run-b"
      const runB = runs[runNameB] as RunActionConfig
      expect(runA).to.exist

      const internal = {
        basePath: garden.projectRoot,
        configFilePath: join(garden.projectRoot, "runs.garden.yml"),
        parentName: "my-runs",
        templateName: "template-runs",
        inputs: { names: [runNameA, runNameB] },
      }

      const expectedRunA: Partial<RunActionConfig> = {
        kind: "Run",
        type: "exec",
        name: runNameA,
        spec: {
          command: ["echo", "${item.value}"],
        },
        internal,
      }
      expect(serialiseUnresolvedTemplates(omit(runA, "internal"))).to.eql(omit(expectedRunA, "internal"))
      expect(serialiseUnresolvedTemplates(omit(runA.internal, "yamlDoc"))).to.eql(expectedRunA.internal)

      const expectedRunB: Partial<RunActionConfig> = {
        kind: "Run",
        type: "exec",
        name: runNameB,
        spec: {
          command: ["echo", "${item.value}"],
        },
        internal,
      }
      expect(serialiseUnresolvedTemplates(omit(runB, "internal"))).to.eql(omit(expectedRunB, "internal"))
      expect(serialiseUnresolvedTemplates(omit(runB.internal, "yamlDoc"))).to.eql(expectedRunB.internal)
    })

    it("should resolve a workflow from a template", async () => {
      const garden = await makeTestGarden(getDataDir("test-projects", "config-templates"))
      await garden.scanAndAddConfigs()

      const workflow = await garden.getRawWorkflowConfig("foo-test")

      const internal = {
        basePath: garden.projectRoot,
        configFilePath: join(garden.projectRoot, "workflows.garden.yml"),
        parentName: "foo",
        templateName: "workflows",
        inputs: {
          name: "test",
          envName: "${environment.name}",
        },
      }

      expect(workflow).to.exist
      expect(serialiseUnresolvedTemplates(workflow.steps)).to.eql([{ script: 'echo "${inputs.envName}"' }])
      expect(serialiseUnresolvedTemplates(omit(workflow.internal, "yamlDoc"))).to.eql(internal)
    })

    it("should not fail when input is used together with an unresolvable variable in the same template string", async () => {
      const garden = await makeTestGarden(getDataDir("test-projects", "config-templates-partial"))
      await garden.scanAndAddConfigs()

      const log = garden.log

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })

      const resolved = await resolveAction({
        garden,
        graph,
        log,
        action: graph.getActionByRef({
          kind: "Build",
          name: "foo-test-dt",
        }),
      })
      expect(resolved).to.exist

      const variables = resolved.getResolvedVariables()
      expect(variables).to.deep.eq({
        myDir: "../../../test",
        syncTargets: [
          {
            source: "../../../foo",
          },
          {
            source: "../../../bar",
          },
        ],
        sync_targets: {
          test: ["foo", "bar"],
        },
      })
    })

    it("should throw on duplicate config template names", async () => {
      const garden = await makeTestGarden(getDataDir("test-projects", "duplicate-config-templates"))

      await expectError(() => garden.scanAndAddConfigs(), {
        contains: [
          "Found duplicate names of ConfigTemplates:",
          "Name combo is used at templates.garden.yml and templates.garden.yml",
        ],
      })
    })

    it("should throw when two modules have the same name", async () => {
      const garden = await makeTestGarden(getDataDir("test-projects", "duplicate-module"))

      await expectError(() => garden.scanAndAddConfigs(), {
        contains: "Module module-a is declared multiple times (in 'module-a/garden.yml' and 'module-b/garden.yml')",
      })
    })

    it("should respect the modules.include and modules.exclude fields, if specified", async () => {
      const projectRoot = getDataDir("test-projects", "project-include-exclude")
      const garden = await makeTestGarden(projectRoot)
      const modules = await garden.resolveModules({ log: garden.log })

      // Should NOT include "nope" and "module-c"
      expect(getNames(modules).sort()).to.eql(["module-a", "module-b"])
    })

    it("should respect the scan.include and scan.exclude fields, if specified", async () => {
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
      // In this project we have custom dotIgnoreFile: .customignore which overrides the default .gardenignore.
      // Thus, all exclusions from .gardenignore will be skipped.
      const projectRoot = getDataDir("test-projects", "dotignore-custom")
      const garden = await makeTestGarden(projectRoot)
      const modules = await garden.resolveModules({ log: garden.log })

      // Root-level .customignore excludes "module-b",
      // and .customignore from "module-c" retains garden.yml file, so the "module-c" is still active.
      expect(getNames(modules).sort()).to.eql(["module-a", "module-c"])
    })

    it("should throw a nice error if module paths overlap", async () => {
      const projectRoot = getDataDir("test-projects", "multiple-module-config-bad")
      const garden = await makeTestGarden(projectRoot)
      await expectError(() => garden.resolveModules({ log: garden.log }), {
        contains: [
          "found multiple enabled modules that share the same garden.yml file or are nested within another",
          "Module module-no-include-a overlaps with module(s) module-a1 (nested).",
          "Module module-no-include-a overlaps with module(s) module-a2 (nested).",
          "Module module-no-include-a overlaps with module(s) module-no-include-b (same path).",
          "Module module-no-include-b overlaps with module(s) module-a1 (nested).",
          "Module module-no-include-b overlaps with module(s) module-a2 (nested).",
          "if this was intentional, there are two options to resolve this error",
          "you can add include and/or exclude directives on the affected modules",
          "you can use the disabled directive to make sure that only one of the modules is enabled",
        ],
      })
    })

    describe("missing secrets", () => {
      it("should not throw when an action config references missing secrets", async () => {
        const garden = await makeTestGarden(getDataDir("missing-secrets", "action"))
        try {
          await garden.scanAndAddConfigs()
        } catch (err) {
          expect.fail("Expected scanAndAddConfigs not to throw")
        }
      })

      it("should not throw when a module config references missing secrets", async () => {
        const garden = await makeTestGarden(getDataDir("missing-secrets", "module"))
        try {
          await garden.scanAndAddConfigs()
        } catch (err) {
          expect.fail("Expected scanAndAddConfigs not to throw")
        }
      })

      it("should not throw when a workflow config references missing secrets", async () => {
        const garden = await makeTestGarden(getDataDir("missing-secrets", "workflow"))
        try {
          await garden.scanAndAddConfigs()
        } catch (err) {
          expect.fail("Expected scanAndAddConfigs not to throw")
        }
      })
    })
  })

  describe("resolveModules", () => {
    it("should throw if a module references itself in a template string", async () => {
      const projectRoot = getDataDir("test-projects", "module-self-ref")
      const garden = await makeTestGarden(projectRoot)
      const key = "${modules.module-a.version}"
      await expectError(() => garden.resolveModules({ log: garden.log }), {
        contains: [
          "Failed resolving one or more modules:",
          `command: ["${key}"]`,
          `Config module-a cannot reference itself.`,
        ],
      })
    })

    it("should resolve module path to external sources dir if module has a remote source", async () => {
      const garden = await makeExtModuleSourcesGarden()

      const module = await garden.resolveModule("module-a")

      expect(module!.path).to.equal(
        join(garden.projectRoot, ".garden", "sources", "module", `module-a--${testGitUrlHash}`)
      )
    })

    it("should handle template variables for non-string fields", async () => {
      const projectRoot = getDataDir("test-projects", "non-string-template-values")
      const garden = await makeTestGarden(projectRoot)

      const module = await garden.resolveModule("module-a")

      // We template in the value for the module's allowPublish field to test this
      expect(module.allowPublish).to.equal(false)
    })

    it("should filter out null build dependencies after resolving template strings", async () => {
      const projectRoot = getDataDir("test-projects", "dynamic-build-dependencies")
      const garden = await makeTestGarden(projectRoot)

      const module = await garden.resolveModule("module-a")
      const moduleCDep = { name: "module-c", copy: [] }
      expect(module.build.dependencies).to.eql([moduleCDep])
      expect(module.spec.build.dependencies).to.eql([moduleCDep])
    })

    it("should correctly resolve template strings referencing nested variables", async () => {
      const test = createGardenPlugin({
        name: "test",
        createModuleTypes: [
          {
            name: "test",
            docs: "test",
            schema: joi.object().keys({ bla: joi.string() }),
            needsBuild: true,
            handlers: {
              convert: convertExecModule,
            },
          },
        ],
      })

      const garden = await TestGarden.factory(pathFoo, {
        plugins: [test],
        config: createProjectConfig({
          name: "test",
          path: pathFoo,
          environments: [{ name: "default", defaultNamespace, variables: { some: { nested: { key: "my value" } } } }],
          providers: [{ name: "test" }],
        }),
      })

      garden.setPartialModuleConfigs([
        {
          apiVersion: GardenApiVersion.v0,
          name: "module-a",
          type: "test",
          allowPublish: false,
          build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
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
            needsBuild: true,
            handlers: {
              convert: convertExecModule,
            },
          },
        ],
      })

      const garden = await TestGarden.factory(pathFoo, {
        plugins: [test],
        config: createProjectConfig({
          name: "test",
          path: pathFoo,
          environments: [{ name: "default", defaultNamespace, variables: { some: { nested: { key: "my value" } } } }],
          providers: [{ name: "test" }],
        }),
      })

      garden.setPartialModuleConfigs([
        {
          apiVersion: GardenApiVersion.v0,
          name: "module-a",
          type: "test",
          allowPublish: false,
          build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
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

    it("should pass through runtime template strings when no runtimeContext is provided", async () => {
      const test = createGardenPlugin({
        name: "test",
        createModuleTypes: [
          {
            name: "test",
            docs: "test",
            schema: joi.object().keys({ bla: joi.string() }),
            needsBuild: true,
            handlers: {
              convert: convertExecModule,
            },
          },
        ],
      })

      const garden = await TestGarden.factory(pathFoo, {
        plugins: [test],
        config: createProjectConfig({
          name: "test",
          path: pathFoo,
          providers: [{ name: "test" }],
        }),
      })

      garden.setPartialModuleConfigs([
        {
          apiVersion: GardenApiVersion.v0,
          name: "module-a",
          type: "test",
          allowPublish: false,
          build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
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
            needsBuild: true,
            handlers: {
              convert: convertExecModule,
            },
          },
        ],
      })

      const garden = await TestGarden.factory(pathFoo, {
        plugins: [test],
        config: createProjectConfig({
          name: "test",
          path: pathFoo,
          providers: [{ name: "test" }],
        }),
      })

      garden.setPartialModuleConfigs([
        {
          apiVersion: GardenApiVersion.v0,
          name: "module-a",
          type: "test",
          allowPublish: false,
          build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
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

    it("should correctly resolve template strings with merge operator", async () => {
      const test = createGardenPlugin({
        name: "test",
        createModuleTypes: [
          {
            name: "test",
            docs: "test",
            schema: joi.object().keys({ bla: joi.object() }),
            needsBuild: true,
            handlers: {
              convert: convertExecModule,
            },
          },
        ],
      })

      const garden = await TestGarden.factory(pathFoo, {
        plugins: [test],
        config: createProjectConfig({
          name: "test",
          path: pathFoo,
          environments: [{ name: "default", defaultNamespace, variables: { obj: { b: "B", c: "c" } } }],
          providers: [{ name: "test" }],
        }),
      })

      garden.setPartialModuleConfigs([
        {
          apiVersion: GardenApiVersion.v0,
          name: "module-a",
          type: "test",
          allowPublish: false,
          build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
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
            needsBuild: true,
            handlers: {
              async configure({ moduleConfig }) {
                if (moduleConfig.name === "module-b") {
                  moduleConfig.build.dependencies = [{ name: "module-a", copy: [] }]
                }
                return { moduleConfig }
              },
              convert: convertExecModule,
            },
          },
        ],
      })

      const garden = await TestGarden.factory(pathFoo, {
        plugins: [test],
        config: createProjectConfig({
          name: "test",
          path: pathFoo,
          providers: [{ name: "test" }],
        }),
      })

      garden.setPartialModuleConfigs([
        {
          apiVersion: GardenApiVersion.v0,
          name: "module-a",
          type: "test",
          allowPublish: false,
          build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
          disabled: false,
          include: [],
          path: pathFoo,
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [],
          spec: {},
        },
        {
          apiVersion: GardenApiVersion.v0,
          name: "module-b",
          type: "test",
          allowPublish: false,
          build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
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
            needsBuild: true,
            handlers: {
              convert: convertExecModule,
            },
          },
        ],
      })

      beforeEach(async () => {
        garden = await TestGarden.factory(pathFoo, {
          noCache: true,
          plugins: [test],
          config: createProjectConfig({
            name: "test",
            path: pathFoo,
            environments: [{ name: "default", defaultNamespace, variables: { some: "variable" } }],
            providers: [{ name: "test" }],
          }),
        })
      })

      afterEach(() => {
        garden.close()
      })

      it("resolves referenced project variables", async () => {
        garden.setPartialModuleConfigs([
          {
            apiVersion: GardenApiVersion.v0,
            name: "module-a",
            type: "test",
            allowPublish: false,
            build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
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
        garden.setPartialModuleConfigs([
          {
            apiVersion: GardenApiVersion.v0,
            name: "module-a",
            type: "test",
            allowPublish: false,
            build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
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
        garden.setPartialModuleConfigs([
          {
            apiVersion: GardenApiVersion.v0,
            name: "module-a",
            type: "test",
            allowPublish: false,
            build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
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
        garden.setPartialModuleConfigs([
          {
            apiVersion: GardenApiVersion.v0,
            name: "module-a",
            type: "test",
            allowPublish: false,
            build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
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
        garden.setPartialModuleConfigs([
          {
            apiVersion: GardenApiVersion.v0,
            name: "module-a",
            type: "test",
            allowPublish: false,
            build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
            include: [],
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
            apiVersion: GardenApiVersion.v0,
            name: "module-b",
            type: "test",
            allowPublish: false,
            build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
            include: [],
            disabled: false,
            path: garden.projectRoot,
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

      const garden = await makeTestGarden(projectRoot)
      garden.cacheKey = "" // Disable caching

      const filePath = resolve(garden.projectRoot, "module-a.log")
      await remove(filePath)

      await garden.resolveModules({ log: garden.log })

      const fileContents = await readFile(filePath)

      expect(fileContents.toString()).to.equal("hellow")
    })

    it("resolves and writes a module file with a source file", async () => {
      const projectRoot = getDataDir("test-projects", "module-templates")

      const garden = await makeTestGarden(projectRoot)
      garden["cacheKey"] = "" // Disable caching

      const filePath = resolve(garden.projectRoot, "module-b.log")
      await remove(filePath)

      await garden.resolveModules({ log: garden.log })

      const fileContents = await readFile(filePath)

      expect(fileContents.toString().trim()).to.equal(dedent`
        Hello I am file!
        input: testValue
        module reference: ${garden.projectRoot}
      `)
    })

    it("resolves and writes a module file to a subdirectory and creates the directory", async () => {
      const projectRoot = getDataDir("test-projects", "module-templates")

      const garden = await makeTestGarden(projectRoot)

      const filePath = resolve(garden.projectRoot, ".garden", "subdir", "module-c.log")
      await remove(filePath)

      await garden.resolveModules({ log: garden.log })

      const fileContents = await readFile(filePath)

      expect(fileContents.toString().trim()).to.equal(dedent`
        Hello I am string!
        input: testValue
        module reference: ${garden.projectRoot}
      `)
    })

    it("passes escaped template strings through when rendering a file", async () => {
      const garden = await makeTestGardenA()

      const targetPath = "targetfile.log"

      garden.setPartialModuleConfigs([
        {
          apiVersion: GardenApiVersion.v0,
          name: "module-a",
          type: "test",
          allowPublish: false,
          build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
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
              resolveTemplates: true,
            },
          ],
        },
      ])

      const module = await garden.resolveModule("module-a")
      const expectedTargetPath = join(module.path, targetPath)
      const contents = await readFile(expectedTargetPath)

      expect(contents.toString()).to.equal("Project name: test-project-a, Escaped string: ${var.foo}")
    })

    it("optionally skips resolving template strings when reading a source file", async () => {
      const garden = await makeTestGardenA()

      const sourcePath = randomString(8) + ".log"
      const sourceFullPath = join(pathFoo, sourcePath)
      const value = "Project name: ${project.name}, Escaped string: $${var.foo}"

      await writeFile(sourceFullPath, value)

      const targetPath = "targetfile.log"

      garden.setPartialModuleConfigs([
        {
          apiVersion: GardenApiVersion.v0,
          name: "module-a",
          type: "test",
          allowPublish: false,
          build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
          disabled: false,
          include: [],
          path: pathFoo,
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [],
          spec: {},
          generateFiles: [
            {
              sourcePath,
              targetPath,
              resolveTemplates: false,
            },
          ],
        },
      ])

      const module = await garden.resolveModule("module-a")
      const expectedTargetPath = join(module.path, targetPath)
      const contents = await readFile(expectedTargetPath)

      expect(contents.toString()).to.equal(value)
    })

    it("throws helpful error is sourcePath doesn't contain globs and can't be found", async () => {
      const garden = await makeTestGardenA()

      garden.setPartialModuleConfigs([
        {
          apiVersion: GardenApiVersion.v0,
          name: "module-a",
          type: "test",
          allowPublish: false,
          build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
          disabled: false,
          include: [],
          path: pathFoo,
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [],
          spec: {},
          generateFiles: [
            {
              sourcePath: "blorg",
              targetPath: "targetfile.log",
              resolveTemplates: false,
            },
          ],
        },
      ])

      await expectError(() => garden.resolveModule("module-a"), {
        contains: [
          "Failed resolving one or more modules:",
          `module-a: Unable to read file at ${pathFoo}/blorg, specified under generateFiles in module module-a: Error: ENOENT: no such file or directory, open '${pathFoo}/blorg'`,
        ],
      })
    })

    it("resolves and writes a module file in a remote module", async () => {
      const garden = await makeTestGarden(pathFoo, {
        noTempDir: true,
        config: createProjectConfig({
          name: "test",
          path: pathFoo,
          providers: [{ name: "test-plugin" }],
        }),
      })

      const sourcePath = randomString(8) + ".log"
      const sourceFullPath = join(pathFoo, sourcePath)
      const tmpRepo = await makeTempDir({ git: true })

      try {
        const targetPath = "targetfile.log"
        await writeFile(sourceFullPath, "hello ${project.name}")

        garden.setPartialModuleConfigs([
          {
            apiVersion: GardenApiVersion.v0,
            name: "module-a",
            type: "test",
            allowPublish: false,
            build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
            disabled: false,
            include: [],
            configPath: join(pathFoo, "module-a.garden.yml"),
            path: pathFoo,
            serviceConfigs: [],
            taskConfigs: [],
            testConfigs: [],
            spec: {},
            repositoryUrl: "file://" + tmpRepo.path + "#main",
            generateFiles: [
              {
                sourcePath,
                targetPath,
                resolveTemplates: true,
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
        noTempDir: true,
        config: createProjectConfig({
          name: "test",
          path: pathFoo,
          providers: [{ name: "test-plugin" }],
        }),
      })

      const sourcePath = randomString(8) + ".log"
      const sourceFullPath = join(pathFoo, sourcePath)
      const tmpRepo = await makeTempDir({ git: true })

      try {
        const targetPath = "targetfile.log"
        await writeFile(sourceFullPath, "hello ${project.name}")

        garden.setPartialModuleConfigs([
          {
            apiVersion: GardenApiVersion.v0,
            name: "module-a",
            type: "test",
            allowPublish: false,
            build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
            disabled: false,
            include: [],
            configPath: join(pathFoo, "module-a.garden.yml"),
            path: pathFoo,
            serviceConfigs: [],
            taskConfigs: [],
            testConfigs: [],
            spec: {},
            repositoryUrl: "file://" + tmpRepo.path + "#main",
            generateFiles: [
              {
                sourcePath,
                targetPath,
                resolveTemplates: true,
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

        await writeFile(join(tmpRepo.path, "module-a.garden.yml"), dump(moduleConfig))
        await exec("git", ["add", "."], { cwd: tmpRepo.path })
        await exec("git", ["commit", "-m", "add module"], { cwd: tmpRepo.path })

        const garden = await makeTestGarden(pathFoo, {
          noTempDir: true,
          config: createProjectConfig({
            name: "test",
            path: pathFoo,
            providers: [{ name: "test-plugin" }],
            sources: [{ name: "remote-module", repositoryUrl: "file://" + tmpRepo.path + "#main" }],
          }),
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

        await writeFile(join(tmpRepo.path, "module-a.garden.yml"), dump(moduleConfig))
        await exec("git", ["add", "."], { cwd: tmpRepo.path })
        await exec("git", ["commit", "-m", "add module"], { cwd: tmpRepo.path })

        const garden = await makeTestGarden(pathFoo, {
          noTempDir: true,
          config: createProjectConfig({
            name: "test",
            path: pathFoo,
            providers: [{ name: "test-plugin" }],
            sources: [{ name: "remote-module", repositoryUrl: "file://" + tmpRepo.path + "#main" }],
          }),
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

      await expectError(() => garden.resolveModules({ log: garden.log }), {
        contains: [
          "Failed resolving one or more modules",
          "module-a: Unrecognized module type 'foo' (defined at module-a/garden.yml). Are you missing a provider configuration?",
        ],
      })
    })

    it("should throw if the module config doesn't match the declared schema", async () => {
      const foo = createGardenPlugin({
        name: "foo",
        createModuleTypes: [
          {
            name: "foo",
            docs: "foo",
            schema: joi.object().keys({ foo: joi.string() }),
            needsBuild: true,
            handlers: {},
          },
        ],
      })

      const garden = await TestGarden.factory(pathFoo, {
        plugins: [foo],
        config: projectConfigFoo,
      })

      garden.setPartialModuleConfigs([
        {
          apiVersion: GardenApiVersion.v0,
          name: "foo",
          type: "foo",
          allowPublish: false,
          build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
          disabled: false,
          path: pathFoo,
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [],
          spec: { bla: "fla" },
        },
      ])

      await expectError(() => garden.resolveModules({ log: garden.log }), {
        contains: [
          "Failed resolving one or more modules",
          "foo: Error validating Module 'foo'",
          '"bla" is not allowed at path [bla]',
        ],
      })
    })

    it("should throw if the module outputs don't match the declared outputs schema", async () => {
      const foo = createGardenPlugin({
        name: "foo",
        createModuleTypes: [
          {
            name: "foo",
            docs: "foo",
            moduleOutputsSchema: joi.object().keys({ foo: joi.string() }),
            needsBuild: true,
            handlers: {
              convert: convertExecModule,
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

      garden.setPartialModuleConfigs([
        {
          apiVersion: GardenApiVersion.v0,
          name: "foo",
          type: "foo",
          allowPublish: false,
          build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
          disabled: false,
          path: pathFoo,
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [],
          spec: {},
        },
      ])

      await expectError(() => garden.resolveModules({ log: garden.log }), {
        contains: [
          "Failed resolving one or more modules:",
          "foo: Error validating outputs for module 'foo':\n\nfoo must be a string",
        ],
      })
    })
  })

  describe("getConfigGraph", () => {
    it("should resolve actions from config templates", async () => {
      const garden = await makeTestGarden(getDataDir("test-projects", "config-templates"))
      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })

      const build = graph.getBuild("foo-test")
      const deploy = graph.getDeploy("foo-test")
      const test = graph.getTest("foo-test")

      const internal = {
        basePath: garden.projectRoot,
        configFilePath: join(garden.projectRoot, "actions.garden.yml"),
        parentName: "foo",
        templateName: "combo",
        inputs: {
          name: "test",
          // these need to be resolved later
          envName: "${environment.name}",
          providerKey: "${providers.test-plugin.outputs.testKey}",
        },
      }

      expect(build.type).to.equal("test")
      expect(serialiseUnresolvedTemplates(omit(build.getInternal(), "yamlDoc"))).to.eql(internal)

      expect(deploy.getBuildAction()?.name).to.equal("foo-test") // <- should be resolved
      expect(serialiseUnresolvedTemplates(omit(deploy.getInternal(), "yamlDoc"))).to.eql(internal)

      expect(test.getDependencies().map((a) => a.key())).to.eql(["build.foo-test"]) // <- should be resolved
      expect(serialiseUnresolvedTemplates(omit(test.getInternal(), "yamlDoc"))).to.eql(internal)
    })

    it("throws with helpful message if action type doesn't exist", async () => {
      const garden = await TestGarden.factory(pathFoo, {
        config: createProjectConfig({
          name: "test",
          path: pathFoo,
          providers: [],
        }),
        plugins: [testPlugin()],
      })

      garden.setPartialActionConfigs([
        {
          kind: "Build",
          type: "invalidtype",
          name: "foo",
          internal: {
            basePath: pathFoo,
          },
          spec: {},
        },
      ])

      await expectError(() => garden.resolveModules({ log: garden.log }), {
        contains: [
          "Unrecognized action type 'invalidtype'",
          "Currently available 'Build' action types: 'container', 'exec', 'test'",
          "Are you missing a provider configuration?",
        ],
      })
    })

    it("throws with helpful message if action kind doesn't exist", async () => {
      const testPluginNoBuildAction = cloneDeep(testPlugin())
      testPluginNoBuildAction.createActionTypes.Build = []

      const garden = await TestGarden.factory(pathFoo, {
        config: createProjectConfig({
          name: "test",
          path: pathFoo,
          providers: [],
        }),
        plugins: [testPluginNoBuildAction],
      })

      garden.setPartialActionConfigs([
        {
          kind: "Build",
          type: "test",
          name: "foo",
          internal: {
            basePath: pathFoo,
          },
          spec: {},
        },
      ])

      await expectError(() => garden.resolveModules({ log: garden.log }), {
        contains: [
          "Unrecognized test action of kind Build",
          "There are no test Build actions, did you mean to specify a",
        ],
      })
    })

    it("should throw an error if modules have circular build dependencies", async () => {
      const garden = await TestGarden.factory(pathFoo, {
        config: createProjectConfig({
          name: "test",
          path: pathFoo,
          providers: [],
        }),
        plugins: [testPlugin()],
      })

      garden.setPartialModuleConfigs([
        {
          apiVersion: GardenApiVersion.v0,
          name: "module-a",
          type: "exec",
          allowPublish: false,
          build: { dependencies: [{ name: "module-b", copy: [] }], timeout: DEFAULT_BUILD_TIMEOUT_SEC }, // <----
          disabled: false,
          path: pathFoo,
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [],
          spec: {},
        },
        {
          apiVersion: GardenApiVersion.v0,
          name: "module-b",
          type: "exec",
          allowPublish: false,
          build: { dependencies: [{ name: "module-a", copy: [] }], timeout: DEFAULT_BUILD_TIMEOUT_SEC }, // <----
          disabled: false,
          path: pathFoo,
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [],
          spec: {},
        },
      ])

      await expectError(() => garden.getConfigGraph({ log: garden.log, emit: false }), {
        contains: ["Detected circular dependencies between module configurations:", "module-a <- module-b <- module-a"],
      })
    })

    it("fully resolves module template inputs before resolving templated modules", async () => {
      const root = getDataDir("test-projects", "module-templates")
      const garden = await makeTestGarden(root)

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const moduleA = graph.getModule("foo-test-a")

      expect(moduleA.spec.build.command).to.eql(["testValue"])
    })

    it("throws if templated module inputs don't match the template inputs schema", async () => {
      const root = getDataDir("test-projects", "module-templates")
      const garden = await makeTestGarden(root)

      await garden.scanAndAddConfigs()

      const moduleA = garden["moduleConfigs"]["foo-test-a"]
      moduleA.inputs = { name: "test", value: 123 }

      await expectError(() => garden.getConfigGraph({ log: garden.log, emit: false }), {
        contains: [
          "Failed resolving one or more modules",
          "foo-test-a: Error validating inputs for module foo-test-a (modules.garden.yml)",
          "value at ./value must be string",
        ],
      })
    })

    it("correctly picks up and handles the environments field on actions", async () => {
      const projectRoot = getDataDir("test-projects", "config-action-environments")
      const garden = await makeTestGarden(projectRoot, { environmentString: "remote" })

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const a = graph.getBuild("a", { includeDisabled: true })
      const b = graph.getBuild("b", { includeDisabled: true })

      expect(a.isDisabled()).to.be.false
      expect(b.isDisabled()).to.be.true
    })

    it("correctly handles version.excludeDependencies", async () => {
      const projectRoot = getDataDir("test-projects", "version-exclude-dependencies")
      let garden = await makeTestGarden(projectRoot, {})

      let graph = await garden.getResolvedConfigGraph({ log: garden.log, emit: false })

      let resolvedRun = graph.getRun("prepare")
      let resolvedTest = graph.getTest("test")

      const versionRunA = resolvedRun.getFullVersion(garden.log)
      const versionTestA = resolvedTest.getFullVersion(garden.log)

      // Add a file to affect the Run version
      await writeFile(join(garden.projectRoot, "test2.log"), "bar")

      garden = await makeTestGarden(projectRoot, {})
      graph = await garden.getResolvedConfigGraph({ log: garden.log, emit: false })

      resolvedRun = graph.getRun("prepare")
      resolvedTest = graph.getTest("test")

      const versionRunB = resolvedRun.getFullVersion(garden.log)
      const versionTestB = resolvedTest.getFullVersion(garden.log)

      expect(versionRunA.versionString).to.not.equal(versionRunB.versionString)
      expect(versionTestA.versionString).to.equal(versionTestB.versionString)
      expect(versionTestA.dependencyVersions["build.test"]).to.exist
      expect(versionTestA.dependencyVersions["run.prepare"]).to.not.exist
      expect(versionTestB.dependencyVersions["build.test"]).to.exist
      expect(versionTestB.dependencyVersions["run.prepare"]).to.not.exist
    })

    it("correctly handles version.excludeFiles", async () => {
      const projectRoot = getDataDir("test-projects", "version-exclude-files")
      let garden = await makeTestGarden(projectRoot, {})

      let graph = await garden.getResolvedConfigGraph({ log: garden.log, emit: false })

      let resolvedTest = graph.getTest("test")

      const modifiedFilePath = join(garden.projectRoot, "test2.log")
      await remove(modifiedFilePath)

      const versionTestA = resolvedTest.getFullVersion(garden.log)

      // Add a file to affect the Run version
      await writeFile(modifiedFilePath, "bar")

      garden = await makeTestGarden(projectRoot, {})
      garden.clearCaches()
      graph = await garden.getResolvedConfigGraph({ log: garden.log, emit: false })

      resolvedTest = graph.getTest("test")

      const versionTestB = resolvedTest.getFullVersion(garden.log)

      // Should have same source version
      expect(versionTestA.sourceVersion).to.equal(versionTestB.sourceVersion)
      // But different files
      expect(versionTestA.files).to.not.eql(versionTestB.files)
    })

    it("correctly handles version.excludeValues", async () => {
      const projectRoot = getDataDir("test-projects", "version-exclude-values")
      const gardenA = await makeTestGarden(projectRoot, { environmentString: "a" })
      const gardenB = await makeTestGarden(projectRoot, { environmentString: "b" })

      const graphA = await gardenA.getConfigGraph({ log: gardenA.log, emit: false })
      const graphB = await gardenB.getConfigGraph({ log: gardenB.log, emit: false })

      const a = graphA.getTest("test")
      const b = graphB.getTest("test")

      const resolvedA = await resolveAction({
        garden: gardenA,
        graph: graphA,
        log: gardenA.log,
        action: a,
      })
      const resolvedB = await resolveAction({
        garden: gardenB,
        graph: graphB,
        log: gardenB.log,
        action: b,
      })

      // The spec.command field should have different values between environments
      expect(resolvedA.getSpec().command).to.not.eql(resolvedB.getSpec().command)

      // But the config versions should still resolve to the same
      expect(a.configVersion(gardenA.log)).to.equal(b.configVersion(gardenB.log))
      expect(resolvedA.configVersion(gardenA.log)).to.equal(resolvedB.configVersion(gardenB.log))
    })

    it("correctly handles project-level excludeValuesFromActionVersions", async () => {
      const projectRoot = getDataDir("test-projects", "project-exclude-values")
      const gardenA = await makeTestGarden(projectRoot, { environmentString: "a" })
      const gardenB = await makeTestGarden(projectRoot, { environmentString: "b" })

      const graphA = await gardenA.getConfigGraph({ log: gardenA.log, emit: false })
      const graphB = await gardenB.getConfigGraph({ log: gardenB.log, emit: false })

      const a = graphA.getTest("test")
      const b = graphB.getTest("test")

      const resolvedA = await resolveAction({
        garden: gardenA,
        graph: graphA,
        log: gardenA.log,
        action: a,
      })
      const resolvedB = await resolveAction({
        garden: gardenB,
        graph: graphB,
        log: gardenB.log,
        action: b,
      })

      // The spec.command field should have different values between environments
      expect(resolvedA.getSpec().command).to.not.eql(resolvedB.getSpec().command)

      // But the config versions should still resolve to the same
      expect(a.configVersion(gardenA.log)).to.equal(b.configVersion(gardenB.log))
      expect(resolvedA.configVersion(gardenA.log)).to.equal(resolvedB.configVersion(gardenB.log))
    })

    it("correctly handles version.excludeFields", async () => {
      const projectRoot = getDataDir("test-projects", "version-exclude-fields")
      const gardenA = await makeTestGarden(projectRoot, { environmentString: "a" })
      const gardenB = await makeTestGarden(projectRoot, { environmentString: "b" })

      const graphA = await gardenA.getConfigGraph({ log: gardenA.log, emit: false })
      const graphB = await gardenB.getConfigGraph({ log: gardenB.log, emit: false })

      const a = graphA.getTest("test")
      const b = graphB.getTest("test")

      const resolvedA = await resolveAction({
        garden: gardenA,
        graph: graphA,
        log: gardenA.log,
        action: a,
      })
      const resolvedB = await resolveAction({
        garden: gardenB,
        graph: graphB,
        log: gardenB.log,
        action: b,
      })

      // The spec.env field should have different values between environments
      expect(resolvedA.getSpec().env).to.not.eql(resolvedB.getSpec().env)

      // But the config versions should still resolve to the same
      expect(a.configVersion(gardenA.log)).to.equal(b.configVersion(gardenB.log))
      expect(resolvedA.configVersion(gardenA.log)).to.equal(resolvedB.configVersion(gardenB.log))
    })

    describe("disabled actions", () => {
      context("should not throw if disabled action does not have a configured provider", () => {
        it("when action is disabled explicitly via `disabled: true` flag", async () => {
          // The action 'k8s-deploy' is disabled and configured only in 'no-k8s' environment that does not have kubernetes provider
          const garden = await makeTestGarden(getDataDir("test-projects", "disabled-action-without-provider"), {
            environmentString: "no-k8s",
          })

          // The disabled action with no provider configured should not cause an error
          const graph = await garden.getConfigGraph({ log: garden.log, emit: false })

          // The action 'k8s-deploy-disabled-via-flag' is disabled via disabled:true flag,
          // and should be unreachable from graph-lookups.
          const actionName = "k8s-deploy-disabled-via-flag"
          void expectError(() => graph.getDeploy(actionName), {
            contains: `Deploy type=kubernetes name=${actionName} is disabled`,
          })

          // The enabled acton 'say-hi' should be reachable from graph-lookups
          const sayHiRun = graph.getRun("say-hi")
          expect(sayHiRun.isDisabled()).to.be.false
        })

        it("when action is disabled implicitly via environment config", async () => {
          // The action 'k8s-deploy' is disabled and configured only in 'no-k8s' environment that does not have kubernetes provider
          const garden = await makeTestGarden(getDataDir("test-projects", "disabled-action-without-provider"), {
            environmentString: "no-k8s",
          })

          // The disabled action with no provider configured should not cause an error
          const graph = await garden.getConfigGraph({ log: garden.log, emit: false })

          // The action 'k8s-deploy-disabled-via-env-config' is disabled via the environment config,
          // and should be unreachable from graph-lookups.
          const actionName = "k8s-deploy-disabled-via-env-config"
          void expectError(() => graph.getDeploy(actionName), {
            contains: `Deploy type=kubernetes name=${actionName} is disabled`,
          })

          // The enabled acton 'say-hi' should be reachable from graph-lookups
          const sayHiRun = graph.getRun("say-hi")
          expect(sayHiRun.isDisabled()).to.be.false
        })
      })
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
            needsBuild: true,
            handlers: {},
          },
        ],
      })
      const foo = createGardenPlugin({
        name: "foo",
        dependencies: [{ name: "base" }],
        createModuleTypes: [
          {
            name: "foo",
            base: "base",
            docs: "foo",
            schema: joi.object().keys({ foo: joi.string().required() }),
            needsBuild: true,
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

      garden.setPartialModuleConfigs([
        {
          apiVersion: GardenApiVersion.v0,
          name: "foo",
          type: "foo",
          allowPublish: false,
          build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
          disabled: false,
          path: pathFoo,
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [],
          spec: { foo: "bar" },
        },
      ])

      await expectError(() => garden.resolveModules({ log: garden.log }), {
        contains: [
          "Failed resolving one or more modules:",
          "foo: Error validating configuration for module 'foo' (base schema from 'base' plugin):\n\nbase is required",
        ],
      })
    })

    it("should throw if the module outputs don't match the base's declared outputs schema", async () => {
      const base = createGardenPlugin({
        name: "base",
        createModuleTypes: [
          {
            name: "base",
            docs: "base",
            moduleOutputsSchema: joi.object().keys({ foo: joi.string() }),
            needsBuild: true,
            handlers: {
              convert: convertExecModule,
            },
          },
        ],
      })
      const foo = createGardenPlugin({
        name: "foo",
        dependencies: [{ name: "base" }],
        createModuleTypes: [
          {
            name: "foo",
            base: "base",
            docs: "foo",
            needsBuild: true,
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

      garden.setPartialModuleConfigs([
        {
          apiVersion: GardenApiVersion.v0,
          name: "foo",
          type: "foo",
          allowPublish: false,
          build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
          disabled: false,
          path: pathFoo,
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [],
          spec: {},
        },
      ])

      await expectError(() => garden.resolveModules({ log: garden.log }), {
        contains: [
          "Failed resolving one or more modules:",
          "foo: Error validating outputs for module 'foo' (base schema from 'base' plugin):\n\nfoo must be a string",
        ],
      })
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
              needsBuild: true,
              handlers: {},
            },
          ],
        })
        const baseB = createGardenPlugin({
          name: "base-b",
          dependencies: [{ name: "base-a" }],
          createModuleTypes: [
            {
              name: "base-b",
              docs: "base-b",
              base: "base-a",
              schema: joi.object().keys({ foo: joi.string() }),
              needsBuild: true,
              handlers: {},
            },
          ],
        })
        const foo = createGardenPlugin({
          name: "foo",
          dependencies: [{ name: "base-b" }],
          createModuleTypes: [
            {
              name: "foo",
              base: "base-b",
              docs: "foo",
              schema: joi.object().keys({ foo: joi.string().required() }),
              needsBuild: true,
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

        garden.setPartialModuleConfigs([
          {
            apiVersion: GardenApiVersion.v0,
            name: "foo",
            type: "foo",
            allowPublish: false,
            build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
            disabled: false,
            path: pathFoo,
            serviceConfigs: [],
            taskConfigs: [],
            testConfigs: [],
            spec: { foo: "bar" },
          },
        ])

        await expectError(() => garden.resolveModules({ log: garden.log }), {
          contains: [
            "Failed resolving one or more modules:",
            "foo: Error validating configuration for module 'foo' (base schema from 'base-a' plugin):\n\nbase is required",
          ],
        })
      })

      it("should throw if the module outputs don't match the base's base's declared outputs schema", async () => {
        const baseA = createGardenPlugin({
          name: "base-a",
          createModuleTypes: [
            {
              name: "base-a",
              docs: "base-a",
              moduleOutputsSchema: joi.object().keys({ foo: joi.string() }),
              needsBuild: true,
              handlers: {},
            },
          ],
        })
        const baseB = createGardenPlugin({
          name: "base-b",
          dependencies: [{ name: "base-a" }],
          createModuleTypes: [
            {
              name: "base-b",
              docs: "base-b",
              base: "base-a",
              needsBuild: true,
              handlers: {
                convert: convertExecModule,
              },
            },
          ],
        })
        const foo = createGardenPlugin({
          name: "foo",
          dependencies: [{ name: "base-b" }],
          createModuleTypes: [
            {
              name: "foo",
              base: "base-b",
              docs: "foo",
              needsBuild: true,
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

        garden.setPartialModuleConfigs([
          {
            apiVersion: GardenApiVersion.v0,
            name: "foo",
            type: "foo",
            allowPublish: false,
            build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
            disabled: false,
            path: pathFoo,
            serviceConfigs: [],
            taskConfigs: [],
            testConfigs: [],
            spec: {},
          },
        ])

        await expectError(() => garden.resolveModules({ log: garden.log }), {
          contains: [
            "Failed resolving one or more modules:",
            "foo: Error validating outputs for module 'foo' (base schema from 'base-a' plugin):\n\nfoo must be a string",
          ],
        })
      })
    })
  })

  context("augmentGraph handler", () => {
    it("should correctly add and resolve actions from the handler", async () => {
      const foo = createGardenPlugin({
        name: "foo",
        createActionTypes: {
          Build: [
            {
              name: "foo",
              docs: "foo",
              schema: joi.object(),
              handlers: {},
            },
          ],
        },
        handlers: {
          augmentGraph: async (_) => {
            return {
              addActions: [
                {
                  kind: "Build",
                  type: "foo",
                  name: "foo",
                  internal: {
                    basePath: pathFoo,
                  },
                  timeout: DEFAULT_BUILD_TIMEOUT_SEC,
                  spec: {},
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

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const actions = graph.getActions()

      expect(actions.length).to.equal(1)
      expect(actions[0].name).to.eql("foo")
    })

    it("should add actions before applying dependencies", async () => {
      const foo = createGardenPlugin({
        name: "foo",
        createActionTypes: {
          Build: [
            {
              name: "foo",
              docs: "foo",
              schema: joi.object(),
              handlers: {},
            },
          ],
        },
        handlers: {
          augmentGraph: async () => {
            return {
              addActions: [
                {
                  kind: "Build",
                  type: "foo",
                  name: "foo",
                  internal: {
                    basePath: pathFoo,
                  },
                  timeout: DEFAULT_BUILD_TIMEOUT_SEC,
                  spec: {},
                },
                {
                  kind: "Build",
                  type: "foo",
                  name: "bar",
                  internal: {
                    basePath: pathFoo,
                  },
                  timeout: DEFAULT_BUILD_TIMEOUT_SEC,
                  spec: {},
                },
              ],
              // This shouldn't work unless build deps are set in right order
              addDependencies: [{ by: { kind: "Build", name: "bar" }, on: { kind: "Build", name: "foo" } }],
            }
          },
        },
      })

      const garden = await TestGarden.factory(pathFoo, {
        plugins: [foo],
        config: projectConfigFoo,
      })

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const bar = graph.getBuild("bar")

      expect(bar.getDependencyReferences()).to.eql([
        {
          explicit: true,
          kind: "Build",
          type: "foo",
          name: "foo",
          needsExecutedOutputs: false,
          needsStaticOutputs: false,
        },
      ])
    })

    it("should apply returned runtime dependency relationships", async () => {
      const foo = createGardenPlugin({
        name: "foo",
        createActionTypes: {
          Build: [
            {
              name: "test",
              docs: "foo",
              schema: joi.object(),
              handlers: {},
            },
          ],
        },
        handlers: {
          augmentGraph: async () => {
            return {
              addDependencies: [{ by: { kind: "Build", name: "bar" }, on: { kind: "Build", name: "foo" } }],
            }
          },
        },
      })

      const garden = await TestGarden.factory(pathFoo, {
        plugins: [foo],
        config: projectConfigFoo,
      })

      garden.setPartialActionConfigs([
        {
          kind: "Build",
          type: "test",
          name: "foo",
          internal: {
            basePath: pathFoo,
          },
          spec: {},
        },
        {
          kind: "Build",
          type: "test",
          name: "bar",
          internal: {
            basePath: pathFoo,
          },
          spec: {},
        },
      ])

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const bar = graph.getBuild("bar")

      expect(bar.getDependencyReferences()).to.eql([
        {
          explicit: true,
          kind: "Build",
          type: "test",
          name: "foo",
          needsExecutedOutputs: false,
          needsStaticOutputs: false,
        },
      ])
    })

    it("should throw if a dependency's `by` reference can't be resolved", async () => {
      const foo = createGardenPlugin({
        name: "foo",
        createActionTypes: {
          Build: [
            {
              name: "test",
              docs: "foo",
              schema: joi.object(),
              handlers: {},
            },
          ],
        },
        handlers: {
          augmentGraph: async () => {
            return {
              addDependencies: [{ by: { kind: "Build", name: "bar" }, on: { kind: "Build", name: "foo" } }],
            }
          },
        },
      })

      const garden = await TestGarden.factory(pathFoo, {
        plugins: [foo],
        config: projectConfigFoo,
      })

      garden.setPartialActionConfigs([
        {
          kind: "Build",
          type: "test",
          name: "bar",
          internal: {
            basePath: pathFoo,
          },
          spec: {},
        },
      ])

      await expectError(() => garden.resolveModules({ log: garden.log }), {
        contains: [
          "Provider 'foo' added a dependency by action 'build.bar' on 'build.foo'",
          "but action 'build.foo' could not be found.",
        ],
      })
    })

    it("should process augmentGraph handlers in dependency order", async () => {
      // Ensure modules added by the dependency are in place before adding dependencies in dependant.
      const foo = createGardenPlugin({
        name: "foo",
        createActionTypes: {
          Build: [
            {
              name: "foo",
              docs: "foo",
              schema: joi.object(),
              handlers: {},
            },
          ],
        },
        handlers: {
          augmentGraph: async () => {
            return {
              addActions: [
                {
                  kind: "Build",
                  type: "foo",
                  name: "foo",
                  internal: {
                    basePath: pathFoo,
                  },
                  timeout: DEFAULT_BUILD_TIMEOUT_SEC,
                  spec: {},
                },
                {
                  kind: "Build",
                  type: "foo",
                  name: "bar",
                  internal: {
                    basePath: pathFoo,
                  },
                  timeout: DEFAULT_BUILD_TIMEOUT_SEC,
                  spec: {},
                },
              ],
            }
          },
        },
      })

      const bar = createGardenPlugin({
        name: "bar",
        dependencies: [{ name: "foo" }],
        handlers: {
          augmentGraph: async () => {
            return {
              // This doesn't work unless providers are processed in right order
              addDependencies: [{ by: { kind: "Build", name: "bar" }, on: { kind: "Build", name: "foo" } }],
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

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const build = graph.getBuild("bar")

      expect(build.getDependencyReferences()).to.eql([
        {
          explicit: true,
          kind: "Build",
          type: "foo",
          name: "foo",
          needsExecutedOutputs: false,
          needsStaticOutputs: false,
        },
      ])

      // Then test wrong order and make sure it throws
      foo.dependencies = [{ name: "bar" }]
      bar.dependencies = []

      garden = await TestGarden.factory(pathFoo, {
        plugins: [foo, bar],
        config,
      })

      await expectError(() => garden.getConfigGraph({ log: garden.log, emit: false }), {
        contains:
          "Provider 'bar' added a dependency by action 'build.bar' on 'build.foo' but action 'build.bar' could not be found.",
      })
    })
  })

  describe("resolveModuleVersion", () => {
    beforeEach(() => td.reset())

    it("should return result from cache if available", async () => {
      const garden = await makeTestGardenA()
      const config = await garden.resolveModule("module-a")
      const version: ModuleVersion = {
        contentHash: "banana",
        versionString: "banana",
        dependencyVersions: {},
        files: [],
      }
      garden.treeCache.set(garden.log, ["moduleVersions", config.name], version, getModuleCacheContext(config))

      const result = await garden.resolveModuleVersion({
        log: garden.log,
        moduleConfig: config,
        moduleDependencies: [],
      })

      expect(result).to.eql(version)
    })

    it("should otherwise calculate fresh version using VCS handler", async () => {
      const garden = await makeTestGardenA()
      await garden.scanAndAddConfigs()

      garden.treeCache.delete(garden.log, ["moduleVersions", "module-b"])

      const config = await garden.resolveModule("module-b")
      garden.vcs.getTreeVersion = async () => ({
        contentHash: "banana",
        files: [],
      })

      const result = await garden.resolveModuleVersion({
        log: garden.log,
        moduleConfig: config,
        moduleDependencies: [],
      })

      expect(result.versionString).not.to.eql(
        config.version.versionString,
        "should be different from the first versionString as VCS returned different version"
      )
    })

    it("should ignore cache if force=true", async () => {
      const garden = await makeTestGardenA()
      const config = await garden.resolveModule("module-a")
      const version: ModuleVersion = {
        contentHash: "banana",
        versionString: "banana",
        dependencyVersions: {},
        files: [],
      }
      garden.treeCache.set(garden.log, ["moduleVersions", config.name], version, getModuleCacheContext(config))

      const result = await garden.resolveModuleVersion({
        log: garden.log,
        moduleConfig: config,
        moduleDependencies: [],
        force: true,
      })

      expect(result).to.not.eql(version)
    })

    context("usage of TestVcsHandler", async () => {
      let handlerA: TestVcsHandler
      let gardenA: TestGarden

      // note: module-a has a version file with this content
      const treeVersionA: TreeVersion = {
        contentHash: "1234567890",
        files: [],
      }

      beforeEach(async () => {
        gardenA = await makeTestGardenA()
        handlerA = new TestVcsHandler({
          garden: gardenA,
          projectRoot: gardenA.projectRoot,
          gardenDirPath: join(gardenA.projectRoot, ".garden"),
          ignoreFile: defaultDotIgnoreFile,
          cache: new TreeCache(),
        })
      })

      afterEach(() => {
        gardenA.close()
      })

      it("should return module version if there are no dependencies", async () => {
        const module = await gardenA.resolveModule("module-a")
        gardenA.vcs = handlerA
        const result = await gardenA.resolveModuleVersion({
          log: gardenA.log,
          moduleConfig: module,
          moduleDependencies: [],
        })

        const treeVersion = await handlerA.getTreeVersion({
          log: gardenA.log,
          projectName: gardenA.projectName,
          config: module,
        })

        expect(result.versionString).to.equal(getModuleVersionString(module, { ...treeVersion, name: "module-a" }, []))
      })

      it("should hash together the version of the module and all dependencies", async () => {
        const moduleConfigs = await gardenA.resolveModules({
          log: gardenA.log,
        })
        gardenA.vcs = handlerA

        const moduleA = findByName(moduleConfigs, "module-a")!
        const moduleB = findByName(moduleConfigs, "module-b")!
        const moduleC = findByName(moduleConfigs, "module-c")!

        gardenA.clearCaches()

        const moduleVersionA: ModuleVersion = {
          contentHash: treeVersionA.contentHash,
          versionString: treeVersionA.contentHash,
          files: [],
          dependencyVersions: {},
        }
        moduleA.version = moduleVersionA
        handlerA.setTestTreeVersion(moduleA.path, treeVersionA)

        const versionStringB = "qwerty"
        const moduleVersionB: ModuleVersion = {
          contentHash: versionStringB,
          versionString: versionStringB,
          files: [],
          dependencyVersions: { "module-a": moduleVersionA.versionString },
        }
        moduleB.version = moduleVersionB
        const treeVersionB: TreeVersion = { contentHash: versionStringB, files: [] }
        handlerA.setTestTreeVersion(moduleB.path, treeVersionB)

        const versionStringC = "asdfgh"
        const treeVersionC: TreeVersion = { contentHash: versionStringC, files: [] }
        handlerA.setTestTreeVersion(moduleC.path, treeVersionC)

        const gardenResolvedModuleVersion = await gardenA.resolveModuleVersion({
          log: gardenA.log,
          moduleConfig: moduleC,
          moduleDependencies: [moduleA, moduleB],
        })

        expect(gardenResolvedModuleVersion.versionString).to.equal(
          getModuleVersionString(moduleC, { ...treeVersionC, name: "module-c" }, [
            { ...moduleVersionA, name: "module-a" },
            { ...moduleVersionB, name: "module-b" },
          ])
        )
        expect(gardenResolvedModuleVersion.dependencyVersions).to.eql({
          "module-a": moduleVersionA.versionString,
          "module-b": moduleVersionB.versionString,
        })
      })

      it("should not include module's garden.yml in version file list", async () => {
        const moduleConfig = await gardenA.resolveModule("module-a")
        const version = await gardenA.resolveModuleVersion({ log: gardenA.log, moduleConfig, moduleDependencies: [] })
        expect(version.files).to.not.include(moduleConfig.configPath!)
      })

      it("should be affected by changes to the module's config", async () => {
        const moduleConfig = await gardenA.resolveModule("module-a")
        const version1 = await gardenA.resolveModuleVersion({ log: gardenA.log, moduleConfig, moduleDependencies: [] })
        moduleConfig.name = "foo"
        const version2 = await gardenA.resolveModuleVersion({ log: gardenA.log, moduleConfig, moduleDependencies: [] })
        expect(version1).to.not.eql(version2)
      })

      it("should not be affected by unimportant changes to the module's garden.yml", async () => {
        const projectRoot = getDataDir("test-projects", "multiple-module-config")
        const garden = await makeTestGarden(projectRoot)
        const moduleConfigA1 = await garden.resolveModule("module-a1")
        const configPath = moduleConfigA1.configPath!
        const orgConfig = await readFile(configPath)

        try {
          const version1 = await gardenA.resolveModuleVersion({
            log: garden.log,
            moduleConfig: moduleConfigA1,
            moduleDependencies: [],
          })
          await writeFile(configPath, orgConfig + "\n---")
          const version2 = await gardenA.resolveModuleVersion({
            log: garden.log,
            moduleConfig: moduleConfigA1,
            moduleDependencies: [],
          })
          expect(version1).to.eql(version2)
        } finally {
          await writeFile(configPath, orgConfig)
        }
      })
    })

    context("test against fixed version hashes", async () => {
      const moduleAVersionString = "v-e9654e4f83"
      const moduleBVersionString = "v-1181dd3716"
      const moduleCVersionString = "v-efb183be26"

      it("should return the same module versions between runtimes", async () => {
        const projectRoot = getDataDir("test-projects", "fixed-version-hashes-1")

        process.env.MODULE_A_TEST_ENV_VAR = "foo"

        const garden = await makeTestGarden(projectRoot)
        const graph = await garden.getConfigGraph({ log: garden.log, emit: false, noCache: true })
        const moduleA = graph.getModule("module-a")
        const moduleB = graph.getModule("module-b")
        const moduleC = graph.getModule("module-c")
        expect(moduleA.version.versionString).to.equal(
          moduleAVersionString,
          "Code changes have affected module version calculation of module-a."
        )
        expect(moduleB.version.versionString).to.equal(
          moduleBVersionString,
          "Code changes have affected module version calculation of module-b."
        )
        expect(moduleC.version.versionString).to.equal(
          moduleCVersionString,
          "Code changes have affected module version calculation of module-c."
        )

        delete process.env.TEST_ENV_VAR
      })

      it("should return the same module versions for identical modules in different projects", async () => {
        const projectRoot = getDataDir("test-projects", "fixed-version-hashes-2")

        process.env.MODULE_A_TEST_ENV_VAR = "foo"

        const garden = await makeTestGarden(projectRoot)
        const graph = await garden.getConfigGraph({ log: garden.log, emit: false, noCache: true })
        const moduleA = graph.getModule("module-a")
        const moduleB = graph.getModule("module-b")
        const moduleC = graph.getModule("module-c")
        expect(moduleA.version.versionString).to.equal(
          moduleAVersionString,
          "Code changes have affected module version calculation of module-a in different projects."
        )
        expect(moduleB.version.versionString).to.equal(
          moduleBVersionString,
          "Code changes have affected module version calculation of module-b in different projects."
        )
        expect(moduleC.version.versionString).to.equal(
          moduleCVersionString,
          "Code changes have affected module version calculation of module-c in different projects."
        )

        delete process.env.MODULE_A_TEST_ENV_VAR
      })

      it("should not return the same module versions if templated variables change", async () => {
        const projectRoot = getDataDir("test-projects", "fixed-version-hashes-1")

        process.env.MODULE_A_TEST_ENV_VAR = "bar"

        const garden = await makeTestGarden(projectRoot)
        const graph = await garden.getConfigGraph({ log: garden.log, emit: false, noCache: true })
        const moduleA = graph.getModule("module-a")
        const moduleB = graph.getModule("module-b")
        const moduleC = graph.getModule("module-c")
        expect(moduleA.version.versionString).to.not.equal(moduleAVersionString)
        expect(moduleB.version.versionString).to.not.equal(moduleBVersionString) // B depends on A so it changes as well
        expect(moduleC.version.versionString).to.not.equal(moduleCVersionString) // C depends on B so it changes as well

        delete process.env.MODULE_A_TEST_ENV_VAR
      })
    })
  })

  describe("resolveExtSourcePath", () => {
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
        const path = await garden.resolveExtSourcePath({
          linkedSources,
          repositoryUrl: testGitUrl,
          name: "source-a",
          sourceType: "project",
        })
        expect(path).to.equal(join(garden.projectRoot, ".garden", "sources", "project", `source-a--${testGitUrlHash}`))
      })

      it("should return the local path of the project source if linked", async () => {
        const localProjectSourceDir = getDataDir("test-projects", "local-project-sources")
        const linkedSourcePath = join(localProjectSourceDir, "source-a")

        const linked: LinkedSource[] = [
          {
            name: "source-a",
            path: linkedSourcePath,
          },
        ]

        const path = await garden.resolveExtSourcePath({
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
        const path = await garden.resolveExtSourcePath({
          linkedSources,
          repositoryUrl: testGitUrl,
          name: "module-a",
          sourceType: "module",
        })
        expect(path).to.equal(join(garden.projectRoot, ".garden", "sources", "module", `module-a--${testGitUrlHash}`))
      })

      it("should return the local path of the module source if linked", async () => {
        const localModuleSourceDir = getDataDir("test-projects", "local-module-sources")
        const linkedModulePath = join(localModuleSourceDir, "module-a")

        const linked: LinkedSource[] = [
          {
            name: "module-a",
            path: linkedModulePath,
          },
        ]

        const path = await garden.resolveExtSourcePath({
          name: "module-a",
          linkedSources: linked,
          repositoryUrl: testGitUrl,
          sourceType: "module",
        })

        expect(path).to.equal(linkedModulePath)
      })
    })
  })

  describe("getExcludeValuesForActionVersions", () => {
    it("should return the exclude values from the project config", async () => {
      const config: ProjectConfig = {
        apiVersion: GardenApiVersion.v2,
        kind: "Project",
        name: "test",
        path: pathFoo,
        internal: {
          basePath: pathFoo,
        },
        defaultEnvironment: "default",
        dotIgnoreFile: ".gitignore",
        excludeValuesFromActionVersions: ["foo", "bar"],
        remoteVariables: [],
        environments: [{ name: "default", defaultNamespace: "foo", variables: {} }],
        providers: [{ name: "foo" }],
        variables: { foo: "default", bar: "something" },
      }

      const garden = await TestGarden.factory(pathFoo, {
        config,
        environmentString: "default",
      })

      const excludeValues = await garden.getExcludeValuesForActionVersions()
      expect(excludeValues).to.eql(["foo", "bar"])
    })

    it("should return an empty array if no exclude values are set", async () => {
      const config: ProjectConfig = {
        apiVersion: GardenApiVersion.v2,
        kind: "Project",
        name: "test",
        path: pathFoo,
        internal: {
          basePath: pathFoo,
        },
        defaultEnvironment: "default",
        dotIgnoreFile: ".gitignore",
        excludeValuesFromActionVersions: [],
        remoteVariables: [],
        environments: [{ name: "default", defaultNamespace: "foo", variables: {} }],
        providers: [{ name: "foo" }],
        variables: { foo: "default", bar: "something" },
      }

      const garden = await TestGarden.factory(pathFoo, {
        config,
        environmentString: "default",
      })

      const excludeValues = await garden.getExcludeValuesForActionVersions()
      expect(excludeValues).to.eql([])
    })

    it("should resolve the exclude values from the project config", async () => {
      const config: ProjectConfig = {
        apiVersion: GardenApiVersion.v2,
        kind: "Project",
        name: "test",
        path: pathFoo,
        internal: {
          basePath: pathFoo,
        },
        defaultEnvironment: "default",
        dotIgnoreFile: ".gitignore",
        excludeValuesFromActionVersions: [
          parseTemplateString({ rawTemplateString: "${var.foo}", source: { yamlDoc: undefined, path: [] } }) as string,
          parseTemplateString({
            rawTemplateString: "${environment.namespace}",
            source: { yamlDoc: undefined, path: [] },
          }) as string,
        ],
        remoteVariables: [],
        environments: [{ name: "default", defaultNamespace: "foo", variables: {} }],
        providers: [{ name: "foo" }],
        variables: { foo: "bar" },
      }

      const garden = await TestGarden.factory(pathFoo, {
        config,
        environmentString: "default",
      })

      const excludeValues = await garden.getExcludeValuesForActionVersions()
      expect(excludeValues).to.eql(["bar", "foo"])
    })

    it("throws if the exclude values has unresolvable template strings", async () => {
      const config: ProjectConfig = {
        apiVersion: GardenApiVersion.v2,
        kind: "Project",
        name: "test",
        path: pathFoo,
        internal: {
          basePath: pathFoo,
        },
        defaultEnvironment: "default",
        dotIgnoreFile: ".gitignore",
        excludeValuesFromActionVersions: [
          parseTemplateString({
            rawTemplateString: "${var.not-found}",
            source: { yamlDoc: undefined, path: [] },
          }) as string,
        ],
        remoteVariables: [],
        environments: [{ name: "default", defaultNamespace: "foo", variables: {} }],
        providers: [{ name: "foo" }],
        variables: { foo: "bar" },
      }

      const garden = await TestGarden.factory(pathFoo, {
        config,
        environmentString: "default",
      })

      await expectError(() => garden.getExcludeValuesForActionVersions(), {
        contains: "could not find key not-found under var",
      })
    })
  })

  describe("warnings", () => {
    let garden: TestGarden
    let key: string

    beforeEach(async () => {
      garden = await makeTestGardenA()
      key = randomString()
    })

    afterEach(() => {
      garden.close()
    })

    describe("hideWarning", () => {
      it("should flag a warning key as hidden", async () => {
        await garden.hideWarning(key)
        const record = (await garden.localConfigStore.get("warnings", key))!
        expect(record).to.exist
        expect(record.hidden).to.be.true
      })

      it("should be a no-op if a key is already hidden", async () => {
        await garden.hideWarning(key)
        await garden.hideWarning(key)
      })
    })

    describe("emitWarning", () => {
      it("should log a warning if the key has not been hidden", async () => {
        const log = garden.log.createLog()
        const message = "Oh noes!"
        await garden.emitWarning({ key, log, message })
        const logs = getLogMessages(log)
        expect(logs.length).to.equal(1)
        expect(logs[0]).to.equal(message + `\n→ Run garden util hide-warning ${key} to disable this message.`)
      })

      it("should not log a warning if the key has been hidden", async () => {
        const log = garden.log.createLog()
        const message = "Oh noes!"
        await garden.hideWarning(key)
        await garden.emitWarning({ key, log, message })
        const logs = getLogMessages(log)
        expect(logs.length).to.equal(0)
      })
    })
  })
})
