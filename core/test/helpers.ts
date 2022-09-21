/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import td from "testdouble"
import { join, relative, resolve } from "path"
import { cloneDeep, extend, intersection, mapValues, merge, pick } from "lodash"
import { copy, ensureDir, mkdirp, pathExists, remove, truncate } from "fs-extra"

import {
  containerDeploySchema,
  containerModuleSpecSchema,
  containerModuleTestSchema,
  containerTaskSchema,
} from "../src/plugins/container/moduleConfig"
import { buildExecAction, prepareExecBuildAction } from "../src/plugins/exec/exec"
import { joi, joiArray } from "../src/config/common"
import { createGardenPlugin, GardenPluginSpec, ProviderHandlers, RegisterPluginParam } from "../src/plugin/plugin"
import { Garden, GardenOpts } from "../src/garden"
import { ModuleConfig } from "../src/config/module"
import { ModuleVersion } from "../src/vcs/vcs"
import { DEFAULT_API_VERSION, GARDEN_CORE_ROOT, gardenEnv, LOCAL_CONFIG_FILENAME } from "../src/constants"
import { globalOptions, GlobalOptions, Parameters, ParameterValues } from "../src/cli/params"
import { ConfigureModuleParams } from "../src/plugin/handlers/module/configure"
import { ExternalSourceType, getRemoteSourceRelPath, hashRepoUrl } from "../src/util/ext-source-util"
import { ActionRouter } from "../src/router/router"
import { CommandParams, ProcessCommandResult } from "../src/commands/base"
import { SuiteFunction, TestFunction } from "mocha"
import { AnalyticsGlobalConfig } from "../src/config-store"
import { EventLogEntry, TestGarden, TestGardenOpts } from "../src/util/testing"
import { Logger, LogLevel } from "../src/logger/logger"
import { ClientAuthToken } from "../src/db/entities/client-auth-token"
import { GardenCli } from "../src/cli/cli"
import { profileAsync } from "../src/util/profiling"
import { defaultDotIgnoreFile, makeTempDir } from "../src/util/fs"
import { DirectoryResult } from "tmp-promise"
import { ConfigurationError } from "../src/exceptions"
import { assert, expect } from "chai"
import Bluebird = require("bluebird")
import execa = require("execa")
import timekeeper = require("timekeeper")
import { execBuildSpecSchema } from "../src/plugins/exec/moduleConfig"
import {
  ExecActionConfig,
  execBuildActionSchema,
  ExecRun,
  execRunActionSchema,
  ExecTest,
  execTestActionSchema,
} from "../src/plugins/exec/config"
import { ActionKind, RunActionHandler, TestActionHandler } from "../src/plugin/action-types"
import { GetRunResult } from "../src/plugin/handlers/run/get-result"
import { WrappedActionRouterHandlers } from "../src/router/base"
import { Resolved } from "../src/actions/types"
import { defaultNamespace, ProjectConfig } from "../src/config/project"
import { ConvertModuleParams } from "../src/plugin/handlers/module/convert"
import { convertContainerModuleRuntimeActions } from "../src/plugins/container/container"
import { ContainerActionConfig } from "../src/plugins/container/config"
import { isTruthy } from "../src/util/util"

export { TempDirectory, makeTempDir } from "../src/util/fs"
export { TestGarden, TestError, TestEventBus, expectError, expectFuzzyMatch } from "../src/util/testing"

export const dataDir = resolve(GARDEN_CORE_ROOT, "test", "data")
export const testNow = new Date()
export const testModuleVersionString = "v-1234512345"
export const testModuleVersion: ModuleVersion = {
  versionString: testModuleVersionString,
  dependencyVersions: {},
  files: [],
}

// All test projects use this git URL
export const testGitUrl = "https://my-git-server.com/my-repo.git#master"
export const testGitUrlHash = hashRepoUrl(testGitUrl)

export function getDataDir(...names: string[]) {
  return resolve(dataDir, ...names)
}

export function getExampleDir(name: string) {
  return resolve(GARDEN_CORE_ROOT, "..", "examples", name)
}

export async function profileBlock(description: string, block: () => Promise<any>) {
  // tslint:disable: no-console
  const startTime = new Date().getTime()
  const result = await block()
  const executionTime = new Date().getTime() - startTime
  console.log(description, "took", executionTime, "ms")
  return result
}

export const projectRootA = getDataDir("test-project-a")
export const projectRootBuildDependants = getDataDir("test-build-dependants")
export const projectTestFailsRoot = getDataDir("test-project-fails")

const testModuleTestSchema = () => containerModuleTestSchema().keys({ command: joi.sparseArray().items(joi.string()) })

const testModuleTaskSchema = () => containerTaskSchema().keys({ command: joi.sparseArray().items(joi.string()) })

export const testModuleSpecSchema = () =>
  containerModuleSpecSchema().keys({
    build: execBuildSpecSchema(),
    tests: joiArray(testModuleTestSchema()),
    tasks: joiArray(testModuleTaskSchema()),
  })

export async function configureTestModule({ moduleConfig }: ConfigureModuleParams) {
  // validate services
  moduleConfig.serviceConfigs = moduleConfig.spec.services.map((spec) => ({
    name: spec.name,
    dependencies: spec.dependencies,
    disabled: spec.disabled,
    sourceModuleName: spec.sourceModuleName,
    spec,
  }))

  moduleConfig.taskConfigs = moduleConfig.spec.tasks.map((t) => ({
    name: t.name,
    dependencies: t.dependencies,
    disabled: t.disabled,
    spec: t,
    timeout: t.timeout,
  }))

  moduleConfig.testConfigs = moduleConfig.spec.tests.map((t) => ({
    name: t.name,
    dependencies: t.dependencies,
    disabled: t.disabled,
    spec: t,
    timeout: t.timeout,
  }))

  return { moduleConfig }
}

const runTest: RunActionHandler<"run", ExecRun> = async ({ action }): Promise<GetRunResult> => {
  const { command } = action.getSpec()

  return {
    state: "ready",
    detail: {
      completedAt: testNow,
      log: command.join(" "),
      startedAt: testNow,
      success: true,
    },
    outputs: {},
  }
}

const testPluginSecrets: { [key: string]: string } = {}

export const testPlugin = () =>
  createGardenPlugin({
    name: "test-plugin",
    dashboardPages: [
      {
        name: "test",
        description: "Test dashboard page",
        title: "Test",
        newWindow: false,
      },
    ],
    handlers: {
      async configureProvider({ config }) {
        for (let member in testPluginSecrets) {
          delete testPluginSecrets[member]
        }
        return { config }
      },

      async getDashboardPage({ page }) {
        return { url: `http://localhost:12345/${page.name}` }
      },

      async getEnvironmentStatus() {
        return { ready: true, outputs: { testKey: "testValue" } }
      },

      async prepareEnvironment() {
        return { status: { ready: true, outputs: { testKey: "testValue" } } }
      },

      async setSecret({ key, value }) {
        testPluginSecrets[key] = "" + value
        return {}
      },

      async getSecret({ key }) {
        return { value: testPluginSecrets[key] || null }
      },

      async deleteSecret({ key }) {
        if (testPluginSecrets[key]) {
          delete testPluginSecrets[key]
          return { found: true }
        } else {
          return { found: false }
        }
      },
      async getDebugInfo() {
        return {
          info: {
            exampleData: "data",
            exampleData2: "data2",
          },
        }
      },
    },

    createActionTypes: {
      Build: [
        {
          name: "test",
          docs: "Test Build action",
          schema: execBuildActionSchema(),
          handlers: {
            build: buildExecAction,
          },
        },
      ],
      Deploy: [
        {
          name: "test",
          docs: "Test Deploy action",
          schema: containerDeploySchema(),
          // schema: execDeployActionSchema(),
          handlers: {
            deploy: async ({}) => {
              return { state: "ready", detail: { state: "ready", detail: {} }, outputs: {} }
            },
            getStatus: async ({}) => {
              return { state: "ready", detail: { state: "ready", detail: {} }, outputs: {} }
            },
            run: async (params) => {
              const res = await runTest({
                ...params,
                action: <Resolved<ExecRun>>(<unknown>params.action),
                artifactsPath: "/tmp",
              })
              return res.detail!
            },
            exec: async ({ action }) => {
              const { command } = action.getSpec()
              return { code: 0, output: "Ran command: " + command.join(" ") }
            },
          },
        },
      ],
      Run: [
        {
          name: "test",
          docs: "Test Run action",
          schema: execRunActionSchema(),
          handlers: {
            run: runTest,
          },
        },
      ],
      Test: [
        {
          name: "test",
          docs: "Test Test action",
          schema: execTestActionSchema(),
          handlers: {
            run: <TestActionHandler<"run", ExecTest>>(<unknown>runTest),
          },
        },
      ],
    },

    createModuleTypes: [
      {
        name: "test",
        docs: "Test module type",
        schema: testModuleSpecSchema(),
        needsBuild: true,
        handlers: {
          convert: async (params: ConvertModuleParams) => {
            const module = params.module
            // We want the build action from the exec conversion, and all the other actions from the container conversion.
            const execBuildAction = prepareExecBuildAction(params)
            const containerRuntimeActions = convertContainerModuleRuntimeActions(params, execBuildAction, false)
            const actions: (ContainerActionConfig | ExecActionConfig)[] = [
              execBuildAction,
              ...containerRuntimeActions,
            ].filter(isTruthy)
            return {
              group: {
                // This is an annoying TypeScript limitation :P
                kind: <"Group">"Group",
                name: module.name,
                path: module.path,
                actions,
              },
            }
          },
          // convert: convertExecModule,
          configure: configureTestModule,

          async getModuleOutputs() {
            return { outputs: { foo: "bar" } }
          },
        },
      },
    ],
  })

export const customizedTestPlugin = (partialCustomSpec: Partial<GardenPluginSpec>) => {
  const base = testPlugin()
  merge(base, partialCustomSpec)
  return base
}

export const testPluginB = () => {
  const base = testPlugin()

  return createGardenPlugin({
    ...base,
    name: "test-plugin-b",
    dependencies: [{ name: "test-plugin" }],
    createModuleTypes: [],
    // This doesn't actually change any behavior, except to use this provider instead of test-plugin
    // TODO-G2: change to extend action types
    // extendModuleTypes: [
    //   {
    //     name: "test",
    //     handlers: base.createModuleTypes![0].handlers,
    //   },
    // ],
  })
}

export const testPluginC = () => {
  const base = testPlugin()

  return createGardenPlugin({
    ...base,
    name: "test-plugin-c",
    // TODO-G2: change to create action types
    createModuleTypes: [
      {
        name: "test-c",
        docs: "Test module type C",
        schema: testModuleSpecSchema(),
        handlers: base.createModuleTypes![0].handlers,
        needsBuild: true,
      },
    ],
  })
}

export const getDefaultProjectConfig = (): ProjectConfig =>
  cloneDeep({
    apiVersion: DEFAULT_API_VERSION,
    kind: "Project",
    name: "test",
    path: "tmp",
    defaultEnvironment: "default",
    dotIgnoreFile: defaultDotIgnoreFile,
    environments: [{ name: "default", defaultNamespace, variables: {} }],
    providers: [],
    variables: {},
  })

export const defaultModuleConfig: ModuleConfig = {
  apiVersion: DEFAULT_API_VERSION,
  type: "test",
  name: "test",
  path: "bla",
  allowPublish: false,
  build: { dependencies: [] },
  disabled: false,
  spec: {
    services: [
      {
        name: "test-service",
        dependencies: [],
      },
    ],
  },
  serviceConfigs: [
    {
      name: "test-service",
      dependencies: [],
      disabled: false,
      spec: {},
    },
  ],
  testConfigs: [],
  taskConfigs: [],
}

export class TestGardenCli extends GardenCli {
  async getGarden(workingDir: string, opts: GardenOpts) {
    return makeTestGarden(workingDir, opts)
  }
}

export const makeTestModule = (params: Partial<ModuleConfig> = {}): ModuleConfig => {
  return { ...defaultModuleConfig, ...params }
}

// Similar to `makeTestModule`, but uses a more minimal default config.
export function makeModuleConfig(path: string, from: Partial<ModuleConfig>): ModuleConfig {
  return {
    apiVersion: DEFAULT_API_VERSION,
    allowPublish: false,
    build: { dependencies: [] },
    disabled: false,
    include: [],
    name: "test",
    path,
    serviceConfigs: [],
    taskConfigs: [],
    spec: {},
    testConfigs: [],
    type: "test",
    ...from,
  }
}

export const testPlugins = () => [testPlugin(), testPluginB(), testPluginC()]

export const testProjectTempDirs: { [root: string]: DirectoryResult } = {}

/**
 * Create a garden instance for testing and setup a project if it doesn't exist already.
 */
export const makeTestGarden = profileAsync(async function _makeTestGarden(
  projectRoot: string,
  opts: TestGardenOpts = {}
): Promise<TestGarden> {
  let targetRoot = projectRoot

  if (!opts.noTempDir) {
    if (!testProjectTempDirs[projectRoot]) {
      // Clone the project root to a temp directory
      testProjectTempDirs[projectRoot] = await makeTempDir({ git: true })
      targetRoot = join(testProjectTempDirs[projectRoot].path, "project")
      await ensureDir(targetRoot)

      await copy(projectRoot, targetRoot, {
        // Don't copy the .garden directory if it exists
        filter: (src: string) => {
          const relSrc = relative(projectRoot, src)
          return relSrc !== ".garden"
        },
      })

      if (opts.config?.path) {
        opts.config.path = targetRoot
      }
      if (opts.config?.configPath) {
        throw new ConfigurationError(`Please don't set the configPath here :) Messes with the temp dir business.`, {})
      }
    }
    targetRoot = join(testProjectTempDirs[projectRoot].path, "project")
  }

  const plugins = [...testPlugins(), ...(opts.plugins || [])]

  return TestGarden.factory(targetRoot, { ...opts, plugins })
})

export const makeTestGardenA = profileAsync(async function _makeTestGardenA(
  extraPlugins: RegisterPluginParam[] = [],
  opts?: TestGardenOpts
) {
  return makeTestGarden(projectRootA, { plugins: extraPlugins, forceRefresh: true, ...opts })
})

export const makeTestGardenBuildDependants = profileAsync(async function _makeTestGardenBuildDependants(
  extraPlugins: RegisterPluginParam[] = [],
  opts?: TestGardenOpts
) {
  return makeTestGarden(projectRootBuildDependants, { plugins: extraPlugins, forceRefresh: true, ...opts })
})

export async function stubProviderAction<T extends keyof ProviderHandlers>(
  garden: Garden,
  pluginName: string,
  type: T,
  handler?: ProviderHandlers[T]
) {
  if (handler) {
    handler["pluginName"] = pluginName
  }
  const actions = await garden.getActionRouter()
  return td.replace(actions.provider["pluginHandlers"][type], pluginName, handler)
}

export function stubRouterAction<K extends ActionKind, H extends keyof WrappedActionRouterHandlers<K>>(
  actionRouter: ActionRouter,
  actionKind: K,
  handlerType: H,
  handler: WrappedActionRouterHandlers<K>[H]
) {
  const actionKindHandlers: WrappedActionRouterHandlers<K> = actionRouter.getRouterForActionKind(actionKind)
  actionKindHandlers[handlerType] = handler
}

export function taskResultOutputs(results: ProcessCommandResult) {
  return mapValues(results.graphResults, (r) => r && r.result)
}

export const cleanProject = async (gardenDirPath: string) => {
  return remove(gardenDirPath)
}

export function withDefaultGlobalOpts<T extends object>(opts: T) {
  return <ParameterValues<GlobalOptions> & T>extend(
    mapValues(globalOptions, (opt) => opt.defaultValue),
    opts
  )
}

export function setPlatform(platform: string) {
  Object.defineProperty(process, "platform", { value: platform })
}

export function freezeTime(date?: Date) {
  if (!date) {
    date = new Date()
  }
  timekeeper.freeze(date)
  return date
}

export async function resetLocalConfig(gardenDirPath: string) {
  const path = join(gardenDirPath, LOCAL_CONFIG_FILENAME)
  if (await pathExists(path)) {
    await truncate(path)
  }
}

/**
 * Idempotently initializes the test-project-ext-project-sources project and returns
 * the Garden class.
 */
export async function makeExtProjectSourcesGarden(opts: TestGardenOpts = {}) {
  const projectRoot = resolve(dataDir, "test-project-ext-project-sources")
  // Borrow the external sources from here:
  const extSourcesRoot = resolve(dataDir, "test-project-local-project-sources")
  const sourceNames = ["source-a", "source-b", "source-c"]
  return prepareRemoteGarden({ projectRoot, extSourcesRoot, sourceNames, type: "project", opts })
}

/**
 * Idempotently initializes the test-project-ext-project-sources project and returns
 * the Garden class.
 */
export async function makeExtModuleSourcesGarden(opts: TestGardenOpts = {}) {
  const projectRoot = resolve(dataDir, "test-project-ext-module-sources")
  // Borrow the external sources from here:
  const extSourcesRoot = resolve(dataDir, "test-project-local-module-sources")
  const sourceNames = ["module-a", "module-b", "module-c"]
  return prepareRemoteGarden({ projectRoot, extSourcesRoot, sourceNames, type: "module", opts })
}

/**
 * Helper function for idempotently initializing the ext-sources projects.
 * Copies the external sources into the .garden directory and git inits them.
 */
async function prepareRemoteGarden({
  projectRoot,
  extSourcesRoot,
  sourceNames,
  type,
  opts = {},
}: {
  projectRoot: string
  extSourcesRoot: string
  sourceNames: string[]
  type: ExternalSourceType
  opts?: TestGardenOpts
}) {
  const garden = await makeTestGarden(projectRoot, opts)
  const sourcesPath = join(garden.projectRoot, ".garden", "sources", type)

  await mkdirp(sourcesPath)
  // Copy the sources to the `.garden/sources` dir and git init them
  await Bluebird.map(sourceNames, async (name) => {
    const remoteSourceRelPath = getRemoteSourceRelPath({ name, url: testGitUrl, sourceType: type })
    const targetPath = join(garden.projectRoot, ".garden", remoteSourceRelPath)
    await copy(join(extSourcesRoot, name), targetPath)
    await execa("git", ["init"], { cwd: targetPath })
  })

  return garden
}

/**
 * Trims the ends of each line of the given input string (useful for multi-line string comparisons)
 */
export function trimLineEnds(str: string) {
  return str
    .split("\n")
    .map((line) => line.trimRight())
    .join("\n")
}

const skipGroups = gardenEnv.GARDEN_SKIP_TESTS.split(" ")

/**
 * Helper function that wraps mocha functions and assigns them to one or more groups.
 *
 * If any of the specified `groups` are included in the `GARDEN_SKIP_TESTS` environment variable
 * (which should be specified as a space-delimited string, e.g. `GARDEN_SKIP_TESTS="group-a group-b"`),
 * the test or suite is skipped.
 *
 * Usage example:
 *
 *   // Skips the test if GARDEN_SKIP_TESTS=some-group
 *   grouped("some-group").it("should do something", () => { ... })
 *
 * @param groups   The group or groups of the test/suite (specify one string or array of strings)
 */
export function grouped(...groups: string[]) {
  const wrapTest = (fn: TestFunction) => {
    if (intersection(groups, skipGroups).length > 0) {
      return fn.skip
    } else {
      return fn
    }
  }

  const wrapSuite = (fn: SuiteFunction) => {
    if (intersection(groups, skipGroups).length > 0) {
      return fn.skip
    } else {
      return fn
    }
  }

  return {
    it: wrapTest(it),
    describe: wrapSuite(describe),
    context: wrapSuite(context),
  }
}

/**
 * Helper function that enables analytics while testing by updating the global config
 * and setting the appropriate environment variables.
 *
 * Returns a reset function that resets the config and environment variables to their
 * previous state.
 *
 * Call this function in a `before` hook and the reset function in an `after` hook.
 *
 * NOTE: Network calls to the analytics endpoint should be mocked when unit testing analytics.
 */
export async function enableAnalytics(garden: TestGarden) {
  const originalDisableAnalyticsEnvVar = gardenEnv.GARDEN_DISABLE_ANALYTICS
  const originalAnalyticsDevEnvVar = gardenEnv.ANALYTICS_DEV

  let originalAnalyticsConfig: AnalyticsGlobalConfig | undefined
  // Throws if analytics is not set
  try {
    // Need to clone object!
    originalAnalyticsConfig = { ...((await garden.globalConfigStore.get(["analytics"])) as AnalyticsGlobalConfig) }
  } catch {}

  await garden.globalConfigStore.set(["analytics", "optedIn"], true)
  gardenEnv.GARDEN_DISABLE_ANALYTICS = false
  // Set the analytics mode to dev for good measure
  gardenEnv.ANALYTICS_DEV = true

  const resetConfig = async () => {
    if (originalAnalyticsConfig) {
      await garden.globalConfigStore.set(["analytics"], originalAnalyticsConfig)
    } else {
      await garden.globalConfigStore.delete(["analytics"])
    }
    gardenEnv.GARDEN_DISABLE_ANALYTICS = originalDisableAnalyticsEnvVar
    gardenEnv.ANALYTICS_DEV = originalAnalyticsDevEnvVar
  }
  return resetConfig
}

export function getRuntimeStatusEvents(eventLog: EventLogEntry[]) {
  const runtimeEventNames = ["taskStatus", "testStatus", "serviceStatus"]
  return eventLog
    .filter((e) => runtimeEventNames.includes(e.name))
    .map((e) => {
      const cloned = { ...e }
      cloned.payload.status = pick(cloned.payload.status, ["state"])
      return cloned
    })
}

/**
 * Initialise test logger.
 *
 * It doesn't register any writers so it only collects logs but doesn't write them.
 */
export function initTestLogger() {
  // make sure logger is initialized
  try {
    Logger.initialize({
      level: LogLevel.info,
      storeEntries: true,
      type: "quiet",
    })
  } catch (_) {}
}

export async function cleanupAuthTokens() {
  await ClientAuthToken.createQueryBuilder().delete().execute()
}

export function makeCommandParams<T extends Parameters = {}, U extends Parameters = {}>({
  garden,
  args,
  opts,
}: {
  garden: Garden
  args: T
  opts: U
}): CommandParams<T, U> {
  const log = garden.log
  return {
    garden,
    log,
    headerLog: log,
    footerLog: log,
    args,
    opts: withDefaultGlobalOpts(opts),
  }
}

type NameOfProperty = string
// https://stackoverflow.com/a/66836940
// useful for typesafe stubbing
export function getPropertyName<T>(
  obj: T,
  expression: (x: { [Property in keyof T]: () => string }) => () => NameOfProperty
): string {
  const res: { [Property in keyof T]: () => string } = {} as { [Property in keyof T]: () => string }

  Object.keys(obj).map((k) => (res[k as keyof T] = () => k))

  return expression(res)()
}
