/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import td from "testdouble"
import Bluebird = require("bluebird")
import { resolve, join, relative } from "path"
import { extend, intersection, pick } from "lodash"
import { remove, copy, mkdirp, pathExists, truncate, ensureDir } from "fs-extra"
import execa = require("execa")

import { containerModuleSpecSchema, containerTestSchema, containerTaskSchema } from "../src/plugins/container/config"
import { testExecModule, buildExecModule, execBuildSpecSchema } from "../src/plugins/exec/exec"
import { joiArray, joi } from "../src/config/common"
import {
  PluginActionHandlers,
  createGardenPlugin,
  RegisterPluginParam,
  ModuleAndRuntimeActionHandlers,
} from "../src/types/plugin/plugin"
import { Garden, GardenOpts } from "../src/garden"
import { ModuleConfig } from "../src/config/module"
import { mapValues } from "lodash"
import { ModuleVersion } from "../src/vcs/vcs"
import { GARDEN_CORE_ROOT, LOCAL_CONFIG_FILENAME, DEFAULT_API_VERSION, gardenEnv } from "../src/constants"
import { LogEntry } from "../src/logger/log-entry"
import timekeeper = require("timekeeper")
import { ParameterValues, globalOptions, GlobalOptions, Parameters } from "../src/cli/params"
import { RunModuleParams } from "../src/types/plugin/module/runModule"
import { ConfigureModuleParams } from "../src/types/plugin/module/configure"
import { RunServiceParams } from "../src/types/plugin/service/runService"
import { RunResult } from "../src/types/plugin/base"
import { ExternalSourceType, getRemoteSourceRelPath, hashRepoUrl } from "../src/util/ext-source-util"
import { ActionRouter } from "../src/actions"
import { CommandParams, ProcessCommandResult } from "../src/commands/base"
import stripAnsi from "strip-ansi"
import { RunTaskParams, RunTaskResult } from "../src/types/plugin/task/runTask"
import { SuiteFunction, TestFunction } from "mocha"
import { AnalyticsGlobalConfig } from "../src/config-store"
import { TestGarden, EventLogEntry, TestGardenOpts } from "../src/util/testing"
import { Logger, LogLevel } from "../src/logger/logger"
import { ExecInServiceParams, ExecInServiceResult } from "../src/types/plugin/service/execInService"
import { ClientAuthToken } from "../src/db/entities/client-auth-token"
import { GardenCli } from "../src/cli/cli"
import { profileAsync } from "../src/util/profiling"
import { makeTempDir } from "../src/util/fs"
import { DirectoryResult } from "tmp-promise"
import { ConfigurationError } from "../src/exceptions"

export { TempDirectory, makeTempDir } from "../src/util/fs"
export { TestGarden, TestError, TestEventBus, expectError } from "../src/util/testing"

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

async function runModule(params: RunModuleParams): Promise<RunResult> {
  const command = [...(params.command || []), ...params.args]

  return {
    moduleName: params.module.name,
    command,
    completedAt: testNow,
    // This is helpful to validate that the correct command was passed in
    log: command.join(" "),
    version: params.module.version.versionString,
    startedAt: testNow,
    success: true,
  }
}

export const projectRootA = getDataDir("test-project-a")
export const projectTestFailsRoot = getDataDir("test-project-fails")

const testModuleTestSchema = () => containerTestSchema().keys({ command: joi.sparseArray().items(joi.string()) })

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
    createModuleTypes: [
      {
        name: "test",
        docs: "Test module type",
        schema: testModuleSpecSchema(),
        handlers: {
          testModule: testExecModule,
          configure: configureTestModule,
          build: buildExecModule,
          runModule,

          async getModuleOutputs() {
            return { outputs: { foo: "bar" } }
          },
          async getServiceStatus() {
            return { state: "ready", detail: {} }
          },
          async deployService() {
            return { state: "ready", detail: {} }
          },

          async execInService({ command }: ExecInServiceParams): Promise<ExecInServiceResult> {
            return { code: 0, output: "Ran command: " + command.join(" ") }
          },

          async runService({
            ctx,
            service,
            interactive,
            runtimeContext,
            timeout,
            log,
          }: RunServiceParams): Promise<RunResult> {
            return runModule({
              ctx,
              log,
              module: service.module,
              args: [service.name],
              interactive,
              runtimeContext,
              timeout,
            })
          },

          async runTask({ ctx, task, interactive, runtimeContext, log }: RunTaskParams): Promise<RunTaskResult> {
            const result = await runModule({
              ctx,
              interactive,
              log,
              runtimeContext,
              module: task.module,
              args: task.spec.command,
              timeout: task.spec.timeout || 9999,
            })

            return {
              ...result,
              taskName: task.name,
              outputs: {
                log: result.log,
              },
            }
          },
        },
      },
    ],
  })

export const testPluginB = () => {
  const base = testPlugin()

  return createGardenPlugin({
    ...base,
    name: "test-plugin-b",
    dependencies: [{ name: "test-plugin" }],
    createModuleTypes: [],
    // This doesn't actually change any behavior, except to use this provider instead of test-plugin
    extendModuleTypes: [
      {
        name: "test",
        handlers: base.createModuleTypes![0].handlers,
      },
    ],
  })
}

export const testPluginC = () => {
  const base = testPlugin()

  return createGardenPlugin({
    ...base,
    name: "test-plugin-c",
    createModuleTypes: [
      {
        name: "test-c",
        docs: "Test module type C",
        schema: testModuleSpecSchema(),
        handlers: base.createModuleTypes![0].handlers,
      },
    ],
  })
}

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
      hotReloadable: false,
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

export async function stubAction<T extends keyof PluginActionHandlers>(
  garden: Garden,
  pluginName: string,
  type: T,
  handler?: PluginActionHandlers[T]
) {
  if (handler) {
    handler["pluginName"] = pluginName
  }
  const actions = await garden.getActionRouter()
  return td.replace(actions["actionHandlers"][type], pluginName, handler)
}

export function stubModuleAction<T extends keyof ModuleAndRuntimeActionHandlers<any>>(
  actions: ActionRouter,
  moduleType: string,
  pluginName: string,
  actionType: T,
  handler: ModuleAndRuntimeActionHandlers<any>[T]
) {
  handler["actionType"] = actionType
  handler["pluginName"] = pluginName
  handler["moduleType"] = moduleType
  return td.replace(actions["moduleActionHandlers"][actionType][moduleType], pluginName, handler)
}

export function taskResultOutputs(results: ProcessCommandResult) {
  return mapValues(results.graphResults, (r) => r && r.output)
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

/**
 * Retrieves all the child log entries from the given LogEntry and returns a list of all the messages,
 * stripped of ANSI characters. Useful to check if a particular message was logged.
 */
export function getLogMessages(log: LogEntry, filter?: (log: LogEntry) => boolean) {
  return log
    .getChildEntries()
    .filter((entry) => (filter ? filter(entry) : true))
    .flatMap((entry) => entry.getMessages()?.map((state) => stripAnsi(state.msg || "")) || [])
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
