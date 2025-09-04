/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as td from "testdouble"
import { join, relative, resolve } from "path"
import {
  cloneDeep,
  extend,
  forOwn,
  intersection,
  isArray,
  isNull,
  isObject,
  isUndefined,
  mapValues,
  merge,
  omit,
  pull,
  uniq,
} from "lodash-es"
import fsExtra from "fs-extra"
const { copy, ensureDir, mkdirp, pathExists, remove, truncate } = fsExtra

import { joi } from "../src/config/common.js"
import type { GardenPluginSpec, ProviderHandlers, RegisterPluginParam } from "../src/plugin/plugin.js"
import type { Garden } from "../src/garden.js"
import type { ModuleConfig } from "../src/config/module.js"
import { DEFAULT_BUILD_TIMEOUT_SEC, GARDEN_CORE_ROOT, GardenApiVersion, gardenEnv } from "../src/constants.js"
import type { GlobalOptions, ParameterObject, ParameterValues } from "../src/cli/params.js"
import { globalOptions } from "../src/cli/params.js"
import type { ExternalSourceType } from "../src/util/ext-source-util.js"
import { getRemoteSourceLocalPath } from "../src/util/ext-source-util.js"
import type { CommandParams, ProcessCommandResult } from "../src/commands/base.js"
import type { SuiteFunction, TestFunction } from "mocha"
import { type AnalyticsGlobalConfig } from "../src/config-store/global.js"
import type { EventLogEntry, TestGardenOpts } from "../src/util/testing.js"
import { TestGarden } from "../src/util/testing.js"
import { LogLevel, RootLogger, parseLogLevel } from "../src/logger/logger.js"
import type { GardenCli } from "../src/cli/cli.js"
import { profileAsync } from "../src/util/profiling.js"
import { defaultDotIgnoreFile, makeTempDir } from "../src/util/fs.js"
import type { DirectoryResult } from "tmp-promise"
import type tmp from "tmp-promise"
import { ConfigurationError } from "../src/exceptions.js"
import { execa } from "execa"
import timekeeper from "timekeeper"
import type { ManyActionTypeDefinitions } from "../src/plugin/action-types.js"
import type { ProjectConfig } from "../src/config/project.js"
import { defaultEnvironment, defaultNamespace } from "../src/config/project.js"
import { localConfigFilename } from "../src/config-store/local.js"
import type { GraphResultMapWithoutTask } from "../src/graph/results.js"
import { dumpYaml } from "../src/util/serialization.js"
import { testPlugins } from "./helpers/test-plugin.js"
import { testDataDir, testGitUrl } from "./helpers/constants.js"
import { exec } from "../src/util/util.js"
import { parseTemplateCollection } from "../src/template/templated-collections.js"

export { TempDirectory, makeTempDir } from "../src/util/fs.js"
export { TestGarden, TestError, TestEventBus, expectError, expectFuzzyMatch } from "../src/util/testing.js"

export * from "./helpers/constants.js"
export * from "./helpers/test-plugin.js"

/**
 * Returns a fully resolved path of a concrete subdirectory located in the {@link testDataDir}.
 * The concrete subdirectory path is defined as a varargs list of its directory names.
 * E.g. `"project", "service-1"` stands for the path `project/service-1`.
 *
 * @param names the subdirectory path
 */
export function getDataDir(...names: string[]) {
  return resolve(testDataDir, ...names)
}

export function getExampleDir(name: string) {
  return resolve(GARDEN_CORE_ROOT, "..", "examples", name)
}

export async function profileBlock(description: string, block: () => Promise<any>) {
  /* eslint-disable no-console */
  const startTime = new Date().getTime()
  const result = await block()
  const executionTime = new Date().getTime() - startTime
  console.log(description, "took", executionTime, "ms")
  return result
}

export const projectRootA = getDataDir("test-project-a")
export const projectRootBuildDependants = getDataDir("test-build-dependants")

export async function makeGarden(tmpDir: tmp.DirectoryResult, plugin: GardenPluginSpec) {
  const config: ProjectConfig = createProjectConfig({
    path: tmpDir.path,
    providers: [{ name: "test" }],
  })

  return await TestGarden.factory(tmpDir.path, { config, plugins: [plugin] })
}

export const getDefaultProjectConfig = (): ProjectConfig =>
  cloneDeep({
    apiVersion: GardenApiVersion.v2,
    kind: "Project",
    name: "test",
    path: "tmp",
    internal: {
      basePath: "/foo",
    },
    defaultEnvironment,
    dotIgnoreFile: defaultDotIgnoreFile,
    excludeValuesFromActionVersions: [],
    variablesFrom: [],
    environments: [{ name: "default", defaultNamespace, variables: {} }],
    providers: [{ name: "test-plugin" }],
    variables: {},
  })

export const createProjectConfig = (partialCustomConfig: Partial<ProjectConfig>): ProjectConfig => {
  const baseConfig = getDefaultProjectConfig()
  // @ts-expect-error todo: correct types for unresolved configs
  return parseTemplateCollection({
    // @ts-expect-error todo: correct types for unresolved configs
    value: merge(baseConfig, partialCustomConfig),
    source: { path: [] },
  })
}

export const defaultModuleConfig: ModuleConfig = {
  apiVersion: GardenApiVersion.v0,
  type: "test",
  name: "test",
  path: "bla",
  allowPublish: false,
  build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
  disabled: false,
  spec: {
    services: [
      {
        name: "test-service",
        dependencies: [],
      },
    ],
    tests: [],
    tasks: [],
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

export const makeTestModule = (params: Partial<ModuleConfig> = {}): ModuleConfig => {
  // deep merge `params` config into `defaultModuleConfig`
  return merge(cloneDeep(defaultModuleConfig), params)
}

/**
 * Similar to {@link makeTestModule}, but uses a more minimal default config.
 * @param path the project root path
 * @param from the partial module config to override the default values
 */
export function makeModuleConfig<M extends ModuleConfig = ModuleConfig>(path: string, from: Partial<M>): ModuleConfig {
  return {
    // NOTE: this apiVersion field is distinct from the apiVersion field in the
    // project configuration, is currently unused and has no meaning.
    // It is hidden in our reference docs.
    apiVersion: GardenApiVersion.v0,
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

      // Add files to git to avoid having to hash all the files
      await exec("git", ["add", "."], { cwd: targetRoot })
      // Note: This will error if there are no files added, hence reject=false
      await exec("git", ["commit", "-m", "copied"], { cwd: targetRoot, reject: false })

      if (opts.config?.path) {
        opts.config.path = targetRoot
      }
      if (opts.config?.configPath) {
        throw new ConfigurationError({
          message: `Please don't set the configPath here :) Messes with the temp dir business.`,
        })
      }
    }
    targetRoot = join(testProjectTempDirs[projectRoot].path, "project")
  }

  const plugins = opts.onlySpecifiedPlugins ? opts.plugins : [...(await testPlugins()), ...(opts.plugins || [])]

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

/**
 * Creates a new TestGarden instance from a temporary path, with a default project config.
 */
export async function makeTempGarden(opts?: TestGardenOpts) {
  const tmpDir = await makeTempDir({ git: true })
  await dumpYaml(join(tmpDir.path, "project.garden.yml"), omit(opts?.config || getDefaultProjectConfig(), "internal"))
  const garden = await makeTestGarden(tmpDir.path, opts)
  return { tmpDir, garden }
}

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

/**
 * Returns an alphabetically sorted list of all processed actions including dependencies from a GraphResultMap.
 */
export function getAllProcessedTaskNames(results: GraphResultMapWithoutTask) {
  const all = Object.keys(results)

  for (const r of Object.values(results)) {
    if (r?.dependencyResults) {
      all.push(...getAllProcessedTaskNames(r.dependencyResults))
    }
  }

  return uniq(all).sort()
}

/**
 * Returns a map of all task results including dependencies from a GraphResultMap.
 */
export function getAllTaskResults(results: GraphResultMapWithoutTask) {
  const all = { ...results }

  for (const r of Object.values(results)) {
    if (r?.dependencyResults) {
      for (const [key, result] of Object.entries(getAllTaskResults(r.dependencyResults))) {
        all[key] = result
      }
    }
  }

  return all
}

export function taskResultOutputs(results: ProcessCommandResult) {
  return mapValues(results.graphResults, (r) => r?.result && omit(r.result, "executedAction"))
}

export const cleanProject = async (gardenDirPath: string) => {
  return remove(gardenDirPath)
}

export function withDefaultGlobalOpts<T extends object>(opts: T): ParameterValues<GlobalOptions> & T {
  return extend(
    mapValues(globalOptions, (opt) => opt.defaultValue!),
    opts
  ) as ParameterValues<GlobalOptions> & T
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
  const path = join(gardenDirPath, localConfigFilename)
  if (await pathExists(path)) {
    await truncate(path)
  }
}

/**
 * Idempotently initializes the test-projects/ext-project-sources project and returns
 * the Garden class.
 */
export async function makeExtProjectSourcesGarden(opts: TestGardenOpts = {}) {
  const projectRoot = getDataDir("test-projects", "ext-project-sources")
  // Borrow the external sources from here:
  const extSourcesRoot = getDataDir("test-projects", "local-project-sources")
  const sourceNames = ["source-a", "source-b", "source-c"]
  return prepareRemoteGarden({ projectRoot, extSourcesRoot, sourceNames, type: "project", opts })
}

/**
 * Idempotently initializes the test-project/ext-action-sources project and returns
 * the Garden class.
 */
export async function makeExtActionSourcesGarden(opts: TestGardenOpts = {}) {
  const projectRoot = getDataDir("test-projects", "ext-action-sources")
  // Borrow the external sources from here:
  const extSourcesRoot = getDataDir("test-projects", "local-action-sources")
  const sourceNames = ["build.a", "build.b"]
  return prepareRemoteGarden({ projectRoot, extSourcesRoot, sourceNames, type: "action", opts })
}

/**
 * Idempotently initializes the test-projects/ext-project-sources project and returns
 * the Garden class.
 */
export async function makeExtModuleSourcesGarden(opts: TestGardenOpts = {}) {
  const projectRoot = getDataDir("test-projects", "ext-module-sources")
  // Borrow the external sources from here:
  const extSourcesRoot = getDataDir("test-projects", "local-module-sources")
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
  await Promise.all(
    sourceNames.map(async (name) => {
      const targetPath = getRemoteSourceLocalPath({ gardenDirPath: garden.gardenDirPath, name, url: testGitUrl, type })
      await copy(join(extSourcesRoot, name), targetPath)
      await execa("git", ["init", "--initial-branch=main"], { cwd: targetPath })
    })
  )

  return garden
}

/**
 * Trims the ends of each line of the given input string (useful for multi-line string comparisons)
 */
export function trimLineEnds(str: string) {
  return str
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
}

const skipGroups = gardenEnv.GARDEN_SKIP_TESTS.split(" ")

// Modified version of https://stackoverflow.com/a/26202058
/**
 * Recursively remove null or undefined values from an object (inluding array elements).
 */
export function pruneEmpty(obj) {
  return (function prune(current) {
    forOwn(current, function (value, key) {
      if (isObject(value)) {
        prune(value)
      } else if (isUndefined(value) || isNull(value)) {
        delete current[key]
      }
    })
    // remove any leftover undefined values from the delete operation on an array
    if (isArray(current)) {
      pull(current, undefined)
    }
    return current
  })(obj)
}

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
    originalAnalyticsConfig = { ...(await garden.globalConfigStore.get("analytics")) }
  } catch {}

  gardenEnv.GARDEN_DISABLE_ANALYTICS = false
  // Set the analytics mode to dev for good measure
  gardenEnv.ANALYTICS_DEV = true

  const resetConfig = async () => {
    if (originalAnalyticsConfig) {
      await garden.globalConfigStore.set("analytics", originalAnalyticsConfig)
    } else {
      await garden.globalConfigStore.set("analytics", {})
    }
    gardenEnv.GARDEN_DISABLE_ANALYTICS = originalDisableAnalyticsEnvVar
    gardenEnv.ANALYTICS_DEV = originalAnalyticsDevEnvVar
  }
  return resetConfig
}

export function findNamespaceStatusEvent(eventLog: EventLogEntry[], namespaceName: string) {
  return eventLog.find((e) => e.name === "namespaceStatus" && e.payload.namespaceName === namespaceName)
}

/**
 * Initialise test logger.
 *
 * It doesn't register any writers so it only collects logs but doesn't write them.
 */
export function initTestLogger() {
  // make sure logger is initialized
  // Set GARDEN_TEST_SHOW_LOGS=true to see logger output when running tests.
  const displayWriterType = process.env.GARDEN_TESTS_SHOW_LOGS ? "basic" : "quiet"
  const logLevelFromEnv = process.env.GARDEN_TESTS_LOG_LEVEL
  const logLevel = logLevelFromEnv ? parseLogLevel(logLevelFromEnv) : LogLevel.info
  try {
    RootLogger.initialize({
      level: <LogLevel>logLevel,
      storeEntries: true,
      displayWriterType,
      force: true,
    })
  } catch (_) {}
}

export function makeCommandParams<T extends ParameterObject, U extends ParameterObject>({
  cli,
  garden,
  args,
  opts,
}: {
  cli?: GardenCli
  garden: Garden
  args: T
  opts: U
}): CommandParams<ParameterObject, ParameterObject> {
  const log = garden.log
  return {
    cli,
    garden,
    log,
    args,
    opts: withDefaultGlobalOpts(opts),
  }
}

type NameOfProperty = string
// https://stackoverflow.com/a/66836940
// useful for typesafe stubbing
export function getPropertyName<T extends {}>(
  obj: T,
  expression: (x: { [Property in keyof T]: () => string }) => () => NameOfProperty
): string {
  const res: { [Property in keyof T]: () => string } = {} as { [Property in keyof T]: () => string }

  Object.keys(obj).map((k) => (res[k as keyof T] = () => k))

  return expression(res)()
}

export function getEmptyPluginActionDefinitions(name: string): ManyActionTypeDefinitions {
  return {
    Build: [{ docs: "blah", handlers: {}, name, schema: joi.object() }],
    Test: [{ docs: "blah", handlers: {}, name, schema: joi.object() }],
    Deploy: [{ docs: "blah", handlers: {}, name, schema: joi.object() }],
    Run: [{ docs: "blah", handlers: {}, name, schema: joi.object() }],
  }
}
