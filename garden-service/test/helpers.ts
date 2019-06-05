/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as td from "testdouble"
import Bluebird = require("bluebird")
import { resolve, join } from "path"
import { extend } from "lodash"
import { remove, readdirSync, existsSync, copy, mkdirp, pathExists, truncate } from "fs-extra"
import execa = require("execa")

import { containerModuleSpecSchema, containerTestSchema, containerTaskSchema } from "../src/plugins/container/config"
import { testExecModule, buildExecModule, execBuildSpecSchema } from "../src/plugins/exec"
import { TaskResults } from "../src/task-graph"
import { validate, joiArray, joi } from "../src/config/common"
import {
  GardenPlugin,
  PluginActions,
  PluginFactory,
  ModuleActions,
  Plugins,
} from "../src/types/plugin/plugin"
import { Garden, GardenParams } from "../src/garden"
import { ModuleConfig } from "../src/config/module"
import { mapValues, fromPairs } from "lodash"
import { ModuleVersion } from "../src/vcs/vcs"
import { GARDEN_SERVICE_ROOT, LOCAL_CONFIG_FILENAME } from "../src/constants"
import { EventBus, Events } from "../src/events"
import { ValueOf } from "../src/util/util"
import { LogEntry } from "../src/logger/log-entry"
import timekeeper = require("timekeeper")
import { GLOBAL_OPTIONS } from "../src/cli/cli"
import { RunModuleParams } from "../src/types/plugin/module/runModule"
import { ConfigureModuleParams } from "../src/types/plugin/module/configure"
import { SetSecretParams } from "../src/types/plugin/provider/setSecret"
import { GetSecretParams } from "../src/types/plugin/provider/getSecret"
import { DeleteSecretParams } from "../src/types/plugin/provider/deleteSecret"
import { RunServiceParams } from "../src/types/plugin/service/runService"
import { RunTaskParams, RunTaskResult } from "../src/types/plugin/task/runTask"
import { RunResult } from "../src/types/plugin/base"
import { ExternalSourceType, getRemoteSourceRelPath, hashRepoUrl } from "../src/util/ext-source-util"

export const dataDir = resolve(GARDEN_SERVICE_ROOT, "test", "unit", "data")
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

export function getDataDir(...names: string[]) {
  return resolve(dataDir, ...names)
}

export async function profileBlock(description: string, block: () => Promise<any>) {
  const startTime = new Date().getTime()
  const result = await block()
  const executionTime = (new Date().getTime()) - startTime
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

const testModuleTestSchema = containerTestSchema
  .keys({ command: joi.array().items(joi.string()) })

const testModuleTaskSchema = containerTaskSchema
  .keys({ command: joi.array().items(joi.string()) })

export const testModuleSpecSchema = containerModuleSpecSchema
  .keys({
    build: execBuildSpecSchema,
    tests: joiArray(testModuleTestSchema),
    tasks: joiArray(testModuleTaskSchema),
  })

export async function configureTestModule({ moduleConfig }: ConfigureModuleParams) {
  moduleConfig.spec = validate(
    moduleConfig.spec,
    testModuleSpecSchema,
    { context: `test module ${moduleConfig.name}` },
  )

  moduleConfig.outputs = { foo: "bar" }

  // validate services
  moduleConfig.serviceConfigs = moduleConfig.spec.services.map(spec => ({
    name: spec.name,
    dependencies: spec.dependencies,
    sourceModuleName: spec.sourceModuleName,
    spec,
  }))

  moduleConfig.taskConfigs = moduleConfig.spec.tasks.map(t => ({
    name: t.name,
    dependencies: t.dependencies,
    spec: t,
    timeout: t.timeout,
  }))

  moduleConfig.testConfigs = moduleConfig.spec.tests.map(t => ({
    name: t.name,
    dependencies: t.dependencies,
    spec: t,
    timeout: t.timeout,
  }))

  return moduleConfig
}

export const testPlugin: PluginFactory = (): GardenPlugin => {
  const secrets = {}

  return {
    actions: {
      async prepareEnvironment() {
        return { status: { ready: true, outputs: {} } }
      },

      async setSecret({ key, value }: SetSecretParams) {
        secrets[key] = value
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
    moduleActions: {
      test: {
        testModule: testExecModule,
        configure: configureTestModule,
        build: buildExecModule,
        runModule,

        async getServiceStatus() { return {} },
        async deployService() { return {} },

        async runService(
          { ctx, service, interactive, runtimeContext, timeout, log }: RunServiceParams,
        ): Promise<RunResult> {
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

        async runTask(
          { ctx, task, interactive, runtimeContext, log }: RunTaskParams,
        ): Promise<RunTaskResult> {
          const result = await runModule({
            ctx,
            interactive,
            log,
            runtimeContext,
            module: task.module,
            args: task.spec.command,
            ignoreError: false,
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
  }
}

export const testPluginB: PluginFactory = async (params) => {
  const plugin = await testPlugin(params)
  plugin.moduleActions = {
    test: plugin.moduleActions!.test,
  }
  return plugin
}

export const testPluginC: PluginFactory = async (params) => {
  const plugin = await testPlugin(params)
  plugin.moduleActions = {
    "test-c": plugin.moduleActions!.test,
  }
  return plugin
}

const defaultModuleConfig: ModuleConfig = {
  apiVersion: "garden.io/v0",
  type: "test",
  name: "test",
  path: "bla",
  allowPublish: false,
  build: { dependencies: [] },
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

  constructor(log: LogEntry) {
    super(log)
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

export const testPlugins = {
  "test-plugin": testPlugin,
  "test-plugin-b": testPluginB,
  "test-plugin-c": testPluginC,
}

export class TestGarden extends Garden {
  events: TestEventBus

  constructor(params: GardenParams) {
    super(params)
    this.events = new TestEventBus(this.log)
  }
}

export const makeTestGarden = async (
  projectRoot: string, { extraPlugins, gardenDirPath }: { extraPlugins?: Plugins, gardenDirPath?: string } = {},
): Promise<TestGarden> => {
  const plugins = { ...testPlugins, ...extraPlugins }
  return TestGarden.factory(projectRoot, { plugins, gardenDirPath })
}

export const makeTestGardenA = async (extraPlugins: Plugins = {}) => {
  return makeTestGarden(projectRootA, { extraPlugins })
}

export function stubAction<T extends keyof PluginActions>(
  garden: Garden, pluginName: string, type: T, handler?: PluginActions[T],
) {
  if (handler) {
    handler["pluginName"] = pluginName
  }
  return td.replace(garden["actionHandlers"][type], pluginName, handler)
}

export function stubModuleAction<T extends keyof ModuleActions<any>>(
  garden: Garden, moduleType: string, pluginName: string, actionType: T, handler: ModuleActions<any>[T],
) {
  handler["actionType"] = actionType
  handler["pluginName"] = pluginName
  handler["moduleType"] = moduleType
  return td.replace(garden["moduleActionHandlers"][actionType][moduleType], pluginName, handler)
}

/**
 * Returns a promise that can be "manually" resolved/rejected by calling resolver/rejecter.
 *
 * This is useful e.g. when testing async control flows where concurrent long-running operations need to be simulated.
 */
export function defer() {
  let outerResolve
  let outerReject
  const promise = new Promise((res, rej) => {
    outerResolve = res
    outerReject = rej
  })

  return { promise, resolver: outerResolve, rejecter: outerReject }
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
  return mapValues(results, r => r.output)
}

export const cleanProject = async (gardenDirPath: string) => {
  return remove(gardenDirPath)
}

export function getExampleProjects() {
  const names = readdirSync(examplesDir).filter(n => {
    const basePath = join(examplesDir, n)
    return existsSync(join(basePath, "garden.yml")) || existsSync(join(basePath, "garden.yaml"))
  })
  return fromPairs(names.map(n => [n, join(examplesDir, n)]))
}

export function withDefaultGlobalOpts(opts: any) {
  return extend(mapValues(GLOBAL_OPTIONS, (opt) => opt.defaultValue), opts)
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
  projectRoot, extSourcesRoot, sourceNames, type,
}: { projectRoot: string, extSourcesRoot: string, sourceNames: string[], type: ExternalSourceType }) {
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
