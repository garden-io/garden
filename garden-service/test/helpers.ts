/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import td from "testdouble"
import tmp from "tmp-promise"
import Bluebird = require("bluebird")
import { resolve, join } from "path"
import { extend, keyBy, intersection } from "lodash"
import { remove, readdirSync, existsSync, copy, mkdirp, pathExists, truncate, realpath } from "fs-extra"
import execa = require("execa")

import { containerModuleSpecSchema, containerTestSchema, containerTaskSchema } from "../src/plugins/container/config"
import { testExecModule, buildExecModule, execBuildSpecSchema } from "../src/plugins/exec"
import { TaskResults } from "../src/task-graph"
import { joiArray, joi } from "../src/config/common"
import {
  PluginActionHandlers,
  createGardenPlugin,
  RegisterPluginParam,
  ModuleAndRuntimeActionHandlers,
} from "../src/types/plugin/plugin"
import { Garden, GardenParams, GardenOpts } from "../src/garden"
import { ModuleConfig } from "../src/config/module"
import { mapValues, fromPairs } from "lodash"
import { ModuleVersion } from "../src/vcs/vcs"
import { GARDEN_SERVICE_ROOT, LOCAL_CONFIG_FILENAME, DEFAULT_API_VERSION } from "../src/constants"
import { EventBus, Events } from "../src/events"
import { ValueOf, exec, findByName, getNames } from "../src/util/util"
import { LogEntry } from "../src/logger/log-entry"
import timekeeper = require("timekeeper")
import { GLOBAL_OPTIONS, GlobalOptions } from "../src/cli/cli"
import { RunModuleParams } from "../src/types/plugin/module/runModule"
import { ConfigureModuleParams } from "../src/types/plugin/module/configure"
import { SetSecretParams } from "../src/types/plugin/provider/setSecret"
import { GetSecretParams } from "../src/types/plugin/provider/getSecret"
import { DeleteSecretParams } from "../src/types/plugin/provider/deleteSecret"
import { RunServiceParams } from "../src/types/plugin/service/runService"
import { RunResult } from "../src/types/plugin/base"
import { ExternalSourceType, getRemoteSourceRelPath, hashRepoUrl } from "../src/util/ext-source-util"
import { ConfigureProviderParams } from "../src/types/plugin/provider/configureProvider"
import { ActionRouter } from "../src/actions"
import { ParameterValues } from "../src/commands/base"
import stripAnsi from "strip-ansi"
import { RunTaskParams, RunTaskResult } from "../src/types/plugin/task/runTask"
import { SuiteFunction, TestFunction } from "mocha"
import { GardenBaseError } from "../src/exceptions"
import { RuntimeContext } from "../src/runtime-context"
import { Module } from "../src/types/module"
import { AnalyticsGlobalConfig } from "../src/config-store"

export const dataDir = resolve(GARDEN_SERVICE_ROOT, "test", "data")
export const examplesDir = resolve(GARDEN_SERVICE_ROOT, "..", "examples")
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

export class TestError extends GardenBaseError {
  type = "_test"
}

export function getDataDir(...names: string[]) {
  return resolve(dataDir, ...names)
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

const testModuleTestSchema = () => containerTestSchema().keys({ command: joi.array().items(joi.string()) })

const testModuleTaskSchema = () => containerTaskSchema().keys({ command: joi.array().items(joi.string()) })

export const testModuleSpecSchema = () =>
  containerModuleSpecSchema().keys({
    build: execBuildSpecSchema(),
    tests: joiArray(testModuleTestSchema()),
    tasks: joiArray(testModuleTaskSchema()),
  })

export async function configureTestModule({ moduleConfig }: ConfigureModuleParams) {
  moduleConfig.outputs = { foo: "bar" }

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

export const testPlugin = createGardenPlugin(() => {
  const secrets: { [key: string]: string } = {}

  return {
    name: "test-plugin",
    handlers: {
      async configureProvider({ config }: ConfigureProviderParams) {
        for (let member in secrets) {
          delete secrets[member]
        }
        return { config }
      },

      async prepareEnvironment() {
        return { status: { ready: true, outputs: {} } }
      },

      async setSecret({ key, value }: SetSecretParams) {
        secrets[key] = "" + value
        return {}
      },

      async getSecret({ key }: GetSecretParams) {
        return { value: secrets[key] || null }
      },

      async deleteSecret({ key }: DeleteSecretParams) {
        if (secrets[key]) {
          delete secrets[key]
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

          async getServiceStatus() {
            return { state: "ready", detail: {} }
          },
          async deployService() {
            return { state: "ready", detail: {} }
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
  }
})

export const testPluginB = createGardenPlugin({
  ...testPlugin,
  name: "test-plugin-b",
  dependencies: ["test-plugin"],
  createModuleTypes: [],
  // This doesn't actually change any behavior, except to use this provider instead of test-plugin
  extendModuleTypes: [
    {
      name: "test",
      handlers: testPlugin.createModuleTypes![0].handlers,
    },
  ],
})

export const testPluginC = createGardenPlugin({
  ...testPlugin,
  name: "test-plugin-c",
  createModuleTypes: [
    {
      name: "test-c",
      docs: "Test module type C",
      schema: testModuleSpecSchema(),
      handlers: testPlugin.createModuleTypes![0].handlers,
    },
  ],
})

const defaultModuleConfig: ModuleConfig = {
  apiVersion: DEFAULT_API_VERSION,
  type: "test",
  name: "test",
  path: "bla",
  allowPublish: false,
  build: { dependencies: [] },
  disabled: false,
  outputs: {},
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

export const makeTestModule = (params: Partial<ModuleConfig> = {}) => {
  return { ...defaultModuleConfig, ...params }
}

interface EventLogEntry {
  name: string
  payload: ValueOf<Events>
}

/**
 * Used for test Garden instances, to log emitted events.
 */
class TestEventBus extends EventBus {
  public eventLog: EventLogEntry[]

  constructor() {
    super()
    this.eventLog = []
  }

  emit<T extends keyof Events>(name: T, payload: Events[T]) {
    this.eventLog.push({ name, payload })
    return super.emit(name, payload)
  }

  clearLog() {
    this.eventLog = []
  }
}

export const testPlugins = [testPlugin, testPluginB, testPluginC]

export class TestGarden extends Garden {
  events: TestEventBus

  constructor(params: GardenParams) {
    super(params)
    this.events = new TestEventBus()
  }

  setModuleConfigs(moduleConfigs: ModuleConfig[]) {
    this.modulesScanned = true
    this.moduleConfigs = keyBy(moduleConfigs, "name")
  }

  /**
   * Returns modules that are registered in this context, fully resolved and configured. Optionally includes
   * disabled modules.
   *
   * Scans for modules in the project root and remote/linked sources if it hasn't already been done.
   */
  async resolveModules({
    log,
    runtimeContext,
    includeDisabled = false,
  }: {
    log: LogEntry
    runtimeContext?: RuntimeContext
    includeDisabled?: boolean
  }): Promise<Module[]> {
    const graph = await this.getConfigGraph(log, runtimeContext)
    return graph.getModules({ includeDisabled })
  }

  /**
   * Helper to get a single module. We don't put this on the Garden class because it is highly inefficient
   * and not advisable except for testing.
   */
  async resolveModule(name: string) {
    const modules = await this.resolveModules({ log: this.log })
    const config = findByName(modules, name)

    if (!config) {
      throw new TestError(`Could not find module config ${name}`, { name, available: getNames(modules) })
    }

    return config
  }
}

export const makeTestGarden = async (projectRoot: string, opts: GardenOpts = {}): Promise<TestGarden> => {
  const plugins = [...testPlugins, ...(opts.plugins || [])]
  return TestGarden.factory(projectRoot, { ...opts, plugins })
}

export const makeTestGardenA = async (extraPlugins: RegisterPluginParam[] = []) => {
  return makeTestGarden(projectRootA, { plugins: extraPlugins })
}

export const makeTestGardenTasksFails = async (extraPlugins: RegisterPluginParam[] = []) => {
  return makeTestGarden(projectTestFailsRoot, { plugins: extraPlugins })
}

export function stubAction<T extends keyof PluginActionHandlers>(
  garden: Garden,
  pluginName: string,
  type: T,
  handler?: PluginActionHandlers[T]
) {
  if (handler) {
    handler["pluginName"] = pluginName
  }
  return td.replace(garden["actionHandlers"][type], pluginName, handler)
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

export async function expectError(fn: Function, typeOrCallback?: string | ((err: any) => void)) {
  try {
    await fn()
  } catch (err) {
    if (typeOrCallback === undefined) {
      return
    } else if (typeof typeOrCallback === "function") {
      return typeOrCallback(err)
    } else {
      if (!err.type) {
        const newError = Error(`Expected GardenError with type ${typeOrCallback}, got: ${err}`)
        newError.stack = err.stack
        throw newError
      }
      if (err.type !== typeOrCallback) {
        const newError = Error(`Expected ${typeOrCallback} error, got: ${err.type} error`)
        newError.stack = err.stack
        throw newError
      }
    }
    return
  }

  if (typeof typeOrCallback === "string") {
    throw new Error(`Expected ${typeOrCallback} error (got no error)`)
  } else {
    throw new Error(`Expected error (got no error)`)
  }
}

export function taskResultOutputs(results: TaskResults) {
  return mapValues(results, (r) => r && r.output)
}

export const cleanProject = async (gardenDirPath: string) => {
  return remove(gardenDirPath)
}

export function getExampleProjects() {
  const names = readdirSync(examplesDir).filter((n) => {
    const basePath = join(examplesDir, n)
    return existsSync(join(basePath, "garden.yml")) || existsSync(join(basePath, "garden.yaml"))
  })
  return fromPairs(names.map((n) => [n, join(examplesDir, n)]))
}

export function withDefaultGlobalOpts<T extends object>(opts: T) {
  return <ParameterValues<GlobalOptions> & T>extend(
    mapValues(GLOBAL_OPTIONS, (opt) => opt.defaultValue),
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
export async function makeExtProjectSourcesGarden() {
  const projectRoot = resolve(dataDir, "test-project-ext-project-sources")
  // Borrow the external sources from here:
  const extSourcesRoot = resolve(dataDir, "test-project-local-project-sources")
  const sourceNames = ["source-a", "source-b", "source-c"]
  return prepareRemoteGarden({ projectRoot, extSourcesRoot, sourceNames, type: "project" })
}

/**
 * Idempotently initializes the test-project-ext-project-sources project and returns
 * the Garden class.
 */
export async function makeExtModuleSourcesGarden() {
  const projectRoot = resolve(dataDir, "test-project-ext-module-sources")
  // Borrow the external sources from here:
  const extSourcesRoot = resolve(dataDir, "test-project-local-module-sources")
  const sourceNames = ["module-a", "module-b", "module-c"]
  return prepareRemoteGarden({ projectRoot, extSourcesRoot, sourceNames, type: "module" })
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
}: {
  projectRoot: string
  extSourcesRoot: string
  sourceNames: string[]
  type: ExternalSourceType
}) {
  const garden = await makeTestGarden(projectRoot)
  const sourcesPath = join(projectRoot, ".garden", "sources", type)

  await mkdirp(sourcesPath)
  // Copy the sources to the `.garden/sources` dir and git init them
  await Bluebird.map(sourceNames, async (name) => {
    const remoteSourceRelPath = getRemoteSourceRelPath({ name, url: testGitUrl, sourceType: type })
    const targetPath = join(projectRoot, ".garden", remoteSourceRelPath)
    await copy(join(extSourcesRoot, name), targetPath)
    await execa("git", ["init"], { cwd: targetPath })
  })

  return garden
}

export type TempDirectory = tmp.DirectoryResult

/**
 * Create a temp directory. Make sure to clean it up after use using the `cleanup()` method on the returned object.
 */
export async function makeTempDir({ git = false }: { git?: boolean } = {}): Promise<TempDirectory> {
  const tmpDir = await tmp.dir({ unsafeCleanup: true })
  // Fully resolve path so that we don't get path mismatches in tests
  tmpDir.path = await realpath(tmpDir.path)

  if (git) {
    await exec("git", ["init"], { cwd: tmpDir.path })
  }

  return tmpDir
}

/**
 * Retrieves all the child log entries from the given LogEntry and returns a list of all the messages,
 * stripped of ANSI characters. Useful to check if a particular message was logged.
 */
export function getLogMessages(log: LogEntry, filter?: (log: LogEntry) => boolean) {
  return log
    .getChildEntries()
    .filter((entry) => (filter ? filter(entry) : true))
    .flatMap((entry) => entry.getMessageStates()?.map((state) => stripAnsi(state.msg || "")) || [])
}

const skipGroups = (process.env.GARDEN_SKIP_TESTS || "").split(" ")

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
  const originalDisableAnalyticsEnvVar = process.env.GARDEN_DISABLE_ANALYTICS
  const originalAnalyticsDevEnvVar = process.env.ANALYTICS_DEV

  let originalAnalyticsConfig: AnalyticsGlobalConfig | undefined
  // Throws if analytics is not set
  try {
    // Need to clone object!
    originalAnalyticsConfig = { ...((await garden.globalConfigStore.get(["analytics"])) as AnalyticsGlobalConfig) }
  } catch {}

  await garden.globalConfigStore.set(["analytics", "optedIn"], true)
  process.env.GARDEN_DISABLE_ANALYTICS = undefined
  // Set the analytics mode to dev for good measure
  process.env.ANALYTICS_DEV = "1"

  const resetConfig = async () => {
    if (originalAnalyticsConfig) {
      await garden.globalConfigStore.set(["analytics"], originalAnalyticsConfig)
    } else {
      await garden.globalConfigStore.delete(["analytics"])
    }
    process.env.GARDEN_DISABLE_ANALYTICS = originalDisableAnalyticsEnvVar
    process.env.ANALYTICS_DEV = originalAnalyticsDevEnvVar
  }
  return resetConfig
}
