/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import env from "env-var"
import type { GlobalOptions, ParameterValues } from "../cli/params.js"
import { globalOptions } from "../cli/params.js"
import cloneDeep from "fast-copy"
import { isEqual, isFunction, keyBy, mapValues, round, set } from "lodash-es"
import type { GardenOpts, GardenParams, GetConfigGraphParams } from "../garden.js"
import { Garden, resolveGardenParams } from "../garden.js"
import type { StringMap } from "../config/common.js"
import type { ModuleConfig } from "../config/module.js"
import type { WorkflowConfig, WorkflowConfigMap } from "../config/workflow.js"
import { type Log, type LogEntry, resolveMsg } from "../logger/log-entry.js"
import type { GardenModule, ModuleConfigMap } from "../types/module.js"
import { findByName, getNames, hashString } from "./util.js"
import { GardenError, InternalError, toGardenError } from "../exceptions.js"
import type { EventName, Events } from "../events/events.js"
import { EventBus } from "../events/events.js"
import { dedent, naturalList } from "./string.js"
import pathIsInside from "path-is-inside"
import { basename, dirname, join, resolve } from "path"
import type { GitScanMode } from "../constants.js"
import { DEFAULT_BUILD_TIMEOUT_SEC, GARDEN_CORE_ROOT, GardenApiVersion } from "../constants.js"
import stripAnsi from "strip-ansi"
import type { VcsHandler } from "../vcs/vcs.js"
import type { ConfigGraph } from "../graph/config-graph.js"
import type { GraphResults } from "../graph/results.js"
import { expect } from "chai"
import type { ActionConfig, ActionConfigMap, ActionKind, ActionStatus, BaseActionConfig } from "../actions/types.js"
import type { WrappedActionRouterHandlers } from "../router/base.js"
import type {
  BuiltinArgs,
  Command,
  CommandArgsType,
  CommandOptionsType,
  CommandResult,
  CommandResultType,
} from "../commands/base.js"
import { validateSchema } from "../config/validation.js"
import fsExtra, { exists } from "fs-extra"
import { GlobalConfigStore } from "../config-store/global.js"
import { isPromise } from "./objects.js"
import type { ConfigTemplateConfig } from "../config/config-template.js"
import type { PluginToolSpec, ToolBuildSpec } from "../plugin/tools.js"
import { fileURLToPath, parse } from "url"
import { createReadStream, createWriteStream } from "fs"
import got from "got"
import { createHash } from "node:crypto"
import { pipeline } from "node:stream/promises"
import type { GardenCloudApiFactory } from "../cloud/api.js"
import { parseTemplateCollection } from "../template/templated-collections.js"
import type { VariablesContext } from "../config/template-contexts/variables.js"

const { mkdirp, remove } = fsExtra

export class TestError extends GardenError {
  type = "_test"
}

export interface EventLogEntry<N extends EventName = any> {
  name: N
  payload: Events[N]
}

/**
 * Retrieves the log entries from the given log context and returns a list of all the messages,
 * stripped of ANSI characters. Useful to check if a particular message was logged.
 */
export function getLogMessages(log: Log, filter?: (log: LogEntry) => boolean) {
  return log
    .getLogEntries()
    .filter((entry) => (filter ? filter(entry) : true))
    .map((entry) => stripAnsi(resolveMsg(entry) || ""))
}

/**
 * Retrieves all the entries from the root log and returns a list of all the messages,
 * stripped of ANSI characters. Useful to check if a particular message was logged.
 */
export function getRootLogMessages(log: Log, filter?: (log: LogEntry) => boolean) {
  return log
    .getAllLogEntries()
    .filter((entry) => (filter ? filter(entry) : true))
    .map((entry) => stripAnsi(resolveMsg(entry) || ""))
}

type PartialActionConfig = Partial<ActionConfig> & { kind: ActionKind; type: string; name: string }
type PartialModuleConfig = Partial<ModuleConfig> & { name: string; path: string }

const moduleConfigDefaults: ModuleConfig = {
  allowPublish: false,
  // NOTE: this apiVersion field is distinct from the apiVersion field in the
  // project configuration, is currently unused and has no meaning.
  // It is hidden in our reference docs.
  apiVersion: GardenApiVersion.v0,
  build: {
    dependencies: [],
    timeout: DEFAULT_BUILD_TIMEOUT_SEC,
  },
  disabled: false,
  name: "foo",
  path: "/tmp/foo",
  serviceConfigs: [],
  spec: {},
  taskConfigs: [],
  testConfigs: [],
  type: "test",
}

export function moduleConfigWithDefaults(partial: PartialModuleConfig): ModuleConfig {
  const defaults = cloneDeep(moduleConfigDefaults)

  const config: ModuleConfig = {
    ...defaults,
    ...partial,
    build: {
      ...defaults.build,
      ...(partial.build || {}),
    },
  }

  // @ts-expect-error todo: correct types for unresolved configs
  return parseTemplateCollection({ value: config, source: { path: [] } })
}

/**
 * Used for test Garden instances, to log emitted events.
 */
export class TestEventBus extends EventBus {
  public eventLog: EventLogEntry[]

  constructor() {
    super()
    this.eventLog = []
  }

  override emit<T extends keyof Events>(name: T, payload: Events[T]) {
    this.eventLog.push({ name, payload })
    return super.emit(name, payload)
  }

  clearLog() {
    this.eventLog = []
  }

  expectEvent<T extends keyof Events>(name: T, payload: Events[T]) {
    for (const event of this.eventLog) {
      if (event.name === name && isEqual(event.payload, payload)) {
        return
      }
    }

    throw new TestError({
      message: dedent`
      Expected event in log with name '${name}' and payload ${JSON.stringify(payload)}.
      Logged events:
      ${this.eventLog.map((e) => JSON.stringify(e)).join("\n")}
    `,
    })
  }
}

const defaultCommandInfo = { name: "test", args: {}, opts: {} }
export const repoRoot = resolve(GARDEN_CORE_ROOT, "..")

export type TestGardenOpts = Partial<GardenOpts> & {
  noCache?: boolean
  noTempDir?: boolean
  onlySpecifiedPlugins?: boolean
  remoteContainerAuth?: boolean
  clearConfigsOnScan?: boolean
  gitScanMode?: GitScanMode
  overrideCloudApiFactory?: GardenCloudApiFactory
}

export class TestGarden extends Garden {
  override events: TestEventBus
  // Overriding the type declarations of a few instance variables to allow reassignment in test code.
  public declare projectId?: string
  public declare actionConfigs: ActionConfigMap
  public declare moduleConfigs: ModuleConfigMap
  public declare workflowConfigs: WorkflowConfigMap
  public declare configTemplates: { [name: string]: ConfigTemplateConfig }
  public declare vcs: VcsHandler
  public declare secrets: StringMap
  public declare variables: VariablesContext
  private repoRoot!: string
  public cacheKey!: string
  public clearConfigsOnScan = false

  constructor(params: GardenParams) {
    super(params)
    this.events = new TestEventBus()
  }

  static override async factory<T extends typeof Garden>(
    this: T,
    currentDirectory: string,
    opts?: TestGardenOpts
  ): Promise<InstanceType<T>> {
    const params = await resolveGardenParams(currentDirectory, { commandInfo: defaultCommandInfo, ...opts })
    if (opts?.gitScanMode) {
      params.projectConfig.scan ??= { git: { mode: opts.gitScanMode } }
      params.projectConfig.scan.git ??= { mode: opts.gitScanMode }
      params.projectConfig.scan.git.mode = opts.gitScanMode
    }

    const garden = new this(params) as InstanceType<T>

    if (pathIsInside(currentDirectory, repoRoot)) {
      garden["repoRoot"] = repoRoot
    }

    const globalDir = join(garden.gardenDirPath, "_global")
    await remove(globalDir)
    await mkdirp(globalDir)

    garden["globalConfigStore"] = new GlobalConfigStore(globalDir)

    return garden
  }

  protected override clearConfigs() {
    if (this.clearConfigsOnScan) {
      super.clearConfigs()
    } else {
      // No-op: We need to disable this method, because it breaks test cases that manually set configs.
    }
  }

  /**
   * Override to cache the config graph.
   */
  override async getConfigGraph(
    params: GetConfigGraphParams & {
      noCache?: boolean
    }
  ): Promise<ConfigGraph> {
    // TODO: re-instate this after we're done refactoring
    // let cacheKey: string | undefined = undefined

    // if (this.cacheKey && !params.noCache) {
    //   const moduleConfigHash = hashString(serializeObject(await this.getRawModuleConfigs()))
    //   cacheKey = [this.cacheKey, moduleConfigHash].join("-")
    // }

    // if (cacheKey) {
    //   const cached = configGraphCache[cacheKey]
    //   if (cached) {
    //     // Clone the cached graph and return
    //     return configGraphCache[cacheKey].clone()
    //   }
    // }

    const graph = await super.getConfigGraph(params)

    // if (cacheKey) {
    //   configGraphCache[cacheKey] = graph
    // }
    return graph
  }

  // Overriding to save time in tests
  override async getRepoRoot() {
    if (this.repoRoot) {
      return this.repoRoot
    }
    return await super.getRepoRoot()
  }

  /**
   * Public wrapper around this.addActionConfig()
   */
  addAction(config: ActionConfig) {
    this.addRawActionConfig(config)
  }

  /**
   * Replace all module configs with the one provided.
   */
  setPartialModuleConfigs(moduleConfigs: PartialModuleConfig[]) {
    this.setRawModuleConfigs(moduleConfigs.map(moduleConfigWithDefaults))
  }

  /**
   * Same as setModuleConfigs, but do not parse the module configs and apply defaults
   */
  setRawModuleConfigs(parsedModuleConfigs: ModuleConfig[]) {
    this.state.configsScanned = true
    this.moduleConfigs = keyBy(parsedModuleConfigs, "name")
  }

  /**
   * Same as setModuleConfigs, but keeps existing configs. Existing configs with the same name as added configs will be overridden.
   */
  overrideRawModuleConfigs(moduleConfigs: PartialModuleConfig[]) {
    this.state.configsScanned = true
    this.moduleConfigs = {
      ...this.moduleConfigs,
      ...keyBy(moduleConfigs.map(moduleConfigWithDefaults), "name"),
    }
  }

  setPartialActionConfigs(actionConfigs: PartialActionConfig[]) {
    this.actionConfigs = {
      Build: {},
      Deploy: {},
      Run: {},
      Test: {},
    }
    actionConfigs.forEach((ac) => {
      const merged: BaseActionConfig = {
        spec: {},
        ...ac,
        // TODO: consider making `timeout` mandatory in `PartialActionConfig`.
        //  It will require extra code changes in tests.
        timeout: ac.timeout || 10,
        internal: {
          basePath: this.projectRoot,
          ...ac.internal,
        },
      }
      this.addRawActionConfig(
        // @ts-expect-error todo: correct types for unresolved configs
        parseTemplateCollection({ value: merged, source: { path: [] } })
      )
    })
  }

  setRawWorkflowConfigs(workflowConfigs: WorkflowConfig[]) {
    this.workflowConfigs = keyBy(workflowConfigs, "name")
  }

  /**
   * Set the action status for a given action key, to be returned by corresponding getStatus/getResult
   * on the test plugin.
   */
  async setTestActionStatus({
    log,
    kind,
    name,
    status,
  }: {
    log: Log
    kind: ActionKind
    name: string
    status: ActionStatus<any>
  }) {
    const providers = await this.resolveProviders({ log })

    if (providers["test-plugin"]) {
      set(providers["test-plugin"], ["_actionStatuses", kind, name], status)
    }
    if (providers["test-plugin-b"]) {
      set(providers["test-plugin-b"], ["_actionStatuses", kind, name], status)
    }
  }

  /**
   * Returns modules that are registered in this context, fully resolved and configured. Optionally includes
   * disabled modules.
   *
   * Scans for modules in the project root and remote/linked sources if it hasn't already been done.
   */
  async resolveModules({
    log,
    graphResults,
    includeDisabled = false,
  }: {
    log: Log
    graphResults?: GraphResults
    includeDisabled?: boolean
  }): Promise<GardenModule[]> {
    const graph = await this.getConfigGraph({ log, graphResults, emit: false })
    return graph.getModules({ includeDisabled })
  }

  /**
   * Helper to get a single module. We don't put this on the Garden class because it is highly inefficient
   * and not advisable except for testing.
   */
  async resolveModule(name: string, graphResults?: GraphResults) {
    const modules = await this.resolveModules({ log: this.log, graphResults })
    const config = findByName(modules, name)

    if (!config) {
      throw new TestError({
        message: `Could not find module config ${name}. Available modules: ${naturalList(getNames(modules))}`,
      })
    }

    return config
  }

  /**
   * Overrides the given action plugin handler, for testing purposes
   *
   * @param actionKind The action kind
   * @param handlerType The handler type (e.g. deploy, run, getStatus etc.)
   * @param handler The handler function to apply
   */
  async stubRouterAction<K extends ActionKind, H extends keyof WrappedActionRouterHandlers<K>>(
    actionKind: K,
    handlerType: H,
    handler: WrappedActionRouterHandlers<K>[H]
  ) {
    const router = await this.getActionRouter()
    const actionKindHandlers: WrappedActionRouterHandlers<K> = router.getRouterForActionKind(actionKind)
    actionKindHandlers[handlerType] = handler
  }

  /**
   * Shorthand helper to call the action method on the given command class.
   * Also validates the result against the outputsSchema on the command, if applicable.
   *
   * @returns The result from the command action
   */
  async runCommand<C extends Command>({
    command,
    args,
    opts,
  }: {
    command: C
    args: ParameterValues<CommandArgsType<C>> & BuiltinArgs
    opts: ParameterValues<CommandOptionsType<C>>
  }): Promise<CommandResult<CommandResultType<C>>> {
    const log = this.log

    const result = await command.action({
      garden: this,
      log,
      args,
      opts: <ParameterValues<GlobalOptions> & CommandOptionsType<C>>{
        ...mapValues(globalOptions, (opt) => opt.defaultValue),
        ...opts,
      },
    })

    if (result.result && command.outputsSchema) {
      await validateSchema(result.result, command.outputsSchema(), {
        context: `outputs from '${command.name}' command`,
        ErrorClass: InternalError,
      })
    }

    return result
  }
}

export function expectFuzzyMatch(
  str: string | undefined | (() => string | undefined),
  sample: string | string[],
  extraMessage?: string
) {
  const actualErrorMsg = isFunction(str) ? str() : str
  const actualErrorMsgLowercase = actualErrorMsg ? stripAnsi(actualErrorMsg).toLowerCase() : actualErrorMsg
  const samples = typeof sample === "string" ? [sample] : sample
  const samplesNonAnsi = samples.map(stripAnsi)
  for (const s of samplesNonAnsi) {
    const expectedErrorSample = s.toLowerCase()

    const assertionMessage = dedent`
      Expected string

        '${actualErrorMsgLowercase}'

      to contain string

        '${expectedErrorSample}'

      ${extraMessage || ""}
    `

    expect(actualErrorMsgLowercase, assertionMessage).to.contain(expectedErrorSample)
  }
}

export function expectLogsContain(logs: string[], sample: string) {
  expect(logs.some((line) => line.includes(sample))).to.be.true
}

type ExpectErrorAssertion =
  | string
  | ((err: any) => void)
  | { type?: string; contains?: string | string[]; errorMessageGetter?: (err: any) => string }

const defaultErrorMessageGetter = (err: any) => err.message

export function expectError(fn: Function, assertion: ExpectErrorAssertion = {}) {
  const handleError = (err: unknown) => {
    if (assertion === undefined) {
      return true
    }

    if (typeof assertion === "function") {
      assertion(err)
      return true
    }

    const type = typeof assertion === "string" ? assertion : assertion.type
    const contains = typeof assertion === "object" && assertion.contains
    const errorMessageGetter = typeof assertion === "object" && assertion.errorMessageGetter
    const message = errorMessageGetter && errorMessageGetter(err)

    if (type) {
      if (!(err instanceof GardenError)) {
        expect.fail(`Expected GardenError, got: ${err}`)
      }

      if (!err.type) {
        expect.fail(`Expected GardenError with type ${type}, got: ${err}`)
      }
      if (err.type !== type) {
        expect.fail(`Expected ${type} error, got: ${err.type} error`)
      }
    }

    if (contains) {
      const errorMessage = (errorMessageGetter || defaultErrorMessageGetter)(err)
      expectFuzzyMatch(
        errorMessage,
        contains,
        dedent`
          \nOriginal error:
          ${stripAnsi(toGardenError(err).stack || "<no stack>")}`
      )
    }

    if (message) {
      if (!(err instanceof GardenError)) {
        expect.fail(`Expected GardenError, got: ${err}`)
      }

      return err.message === message
    }

    return true
  }

  const handleNonError = (caught: boolean) => {
    if (caught) {
      return
    } else if (typeof assertion === "string") {
      expect.fail(`Expected ${assertion} error (got no error)`)
    } else {
      expect.fail(`Expected error (got no error)`)
    }
  }

  try {
    const res = fn()
    if (isPromise(res)) {
      return res
        .then(() => false)
        .catch(handleError)
        .then((caught) => handleNonError(caught))
    }
  } catch (err) {
    handleError(err)
    return
  }

  return handleNonError(false)
}

// adapted from https://stackoverflow.com/a/18543419/1518423
export function captureStream(stream: NodeJS.WritableStream) {
  const oldWrite = stream.write
  let buf = ""

  class FakeWrite {
    write(chunk, _callback)
    write(chunk, _encoding?, _callback?) {
      buf += chunk.toString()
    }
  }

  stream["write"] = FakeWrite.prototype.write

  return {
    unhook: function unhook() {
      stream.write = oldWrite
    },
    captured: () => {
      return buf
    },
  }
}

export function equalWithPrecision(a: number, b: number, precision: number): boolean {
  const rawDiff = Math.abs(a - b)
  const diff = round(rawDiff, precision)
  const eps = Math.pow(10, -precision)
  return diff <= eps
}

interface ToolBuildSpecLike {
  platform: string
  architecture: string
  url: string
  sha256: string
}

export async function downloadAndVerifyHash({ architecture, platform, sha256, url }: ToolBuildSpec): Promise<void>
export async function downloadAndVerifyHash({ architecture, platform, sha256, url }: ToolBuildSpecLike): Promise<void>
export async function downloadAndVerifyHash({ architecture, platform, sha256, url }: ToolBuildSpecLike): Promise<void> {
  // This is an ESM module, so we need to use fileurltopath
  const downloadDir = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    "..",
    ".test-tools-verification-cache"
  )

  await mkdirp(downloadDir)

  const artifactName = `${platform}-${architecture}-${hashString(url, 5)}-${basename(url)}`
  const targetExecutable = join(downloadDir, artifactName)

  if (await exists(targetExecutable)) {
    const existingHash = createHash("sha256")
    await pipeline(createReadStream(targetExecutable), existingHash)

    const existingSha256 = existingHash.digest("hex")
    if (existingSha256 === sha256) {
      // eslint-disable-next-line no-console
      console.log(`Cached test result for ${platform}-${architecture} from ${url}`)
      return
    }
  }

  // eslint-disable-next-line no-console
  console.log(`Downloading ${platform}-${architecture} from ${url}`)
  const parsed = parse(url)
  const protocol = parsed.protocol

  const response =
    protocol === "file:"
      ? createReadStream(parsed.path!)
      : got.stream({
          method: "GET",
          url,
        })
  const downloadedHash = response.pipe(createHash("sha256"))

  const writeStream = createWriteStream(targetExecutable)
  await pipeline(response, writeStream)
  // eslint-disable-next-line no-console
  console.log(`Download completed`)

  // eslint-disable-next-line no-console
  console.log(`Verifying hash for ${artifactName}`)

  // Wait until the hash is available, as it's not part of the pipeline
  await new Promise((r) => downloadedHash.once("readable", r))

  const downloadedSha256 = downloadedHash.digest("hex")

  // eslint-disable-next-line no-console
  console.log(`Downloaded hash: ${downloadedSha256}`)
  // eslint-disable-next-line no-console
  console.log(`Spec hash: ${sha256}`)

  expect(downloadedSha256).to.eql(sha256)
}

/**
 * This function is used to skip some tests and modify some expectations in CircleCI pipeline.
 */
export function isCiEnv() {
  const ciEnv = env.get("CI").required(false).asBool()
  const circleCiEnv = env.get("CIRCLECI").required(false).asBool()
  return ciEnv || circleCiEnv
}

export const downloadBinariesAndVerifyHashes = (toolSpecs: PluginToolSpec[]) => {
  for (const toolSpec of toolSpecs) {
    describe(`${toolSpec.name} ${toolSpec.version}`, () => {
      for (const build of toolSpec.builds) {
        it(`${toolSpec.name} ${toolSpec.version} ${build.platform}-${build.architecture}`, async function () {
          await downloadAndVerifyHash(build)
        })
      }
    })
  }
}
