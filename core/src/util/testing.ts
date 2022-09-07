/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { cloneDeep, isEqual, keyBy } from "lodash"
import { Garden, GardenOpts, GardenParams, resolveGardenParams } from "../garden"
import { DeepPrimitiveMap, StringMap } from "../config/common"
import { ModuleConfig } from "../config/module"
import { WorkflowConfig } from "../config/workflow"
import { LogEntry } from "../logger/log-entry"
import { GardenModule } from "../types/module"
import { findByName, getNames, hashString, isPromise, serializeObject, uuidv4, ValueOf } from "./util"
import { GardenBaseError, GardenError } from "../exceptions"
import { EventBus, Events } from "../events"
import { dedent } from "./string"
import pathIsInside from "path-is-inside"
import { resolve } from "path"
import { DEFAULT_API_VERSION, GARDEN_CORE_ROOT } from "../constants"
import { getLogger } from "../logger/logger"
import stripAnsi from "strip-ansi"
import { VcsHandler } from "../vcs/vcs"
import { ConfigGraph } from "../graph/config-graph"
import { SolveParams } from "../graph/solver"
import { GraphResults } from "../graph/results"
import { expect } from "chai"

export class TestError extends GardenBaseError {
  type = "_test"
}

export interface EventLogEntry {
  name: string
  payload: ValueOf<Events>
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

type PartialModuleConfig = Partial<ModuleConfig> & { name: string; path: string }

const moduleConfigDefaults: ModuleConfig = {
  allowPublish: false,
  apiVersion: DEFAULT_API_VERSION,
  build: {
    dependencies: [],
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

export function moduleConfigWithDefaults(partial: PartialModuleConfig) {
  const defaults = cloneDeep(moduleConfigDefaults)

  return {
    ...defaults,
    ...partial,
    build: {
      ...defaults.build,
      ...(partial.build || {}),
    },
  }
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

  emit<T extends keyof Events>(name: T, payload: Events[T]) {
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

    throw new TestError(
      dedent`
      Expected event in log with name '${name}' and payload ${JSON.stringify(payload)}.
      Logged events:
      ${this.eventLog.map((e) => JSON.stringify(e)).join("\n")}
    `,
      { name, payload }
    )
  }
}

const defaultCommandinfo = { name: "test", args: {}, opts: {} }
const repoRoot = resolve(GARDEN_CORE_ROOT, "..")

const paramCache: { [key: string]: GardenParams } = {}
// const configGraphCache: { [key: string]: ConfigGraph } = {}

export type TestGardenOpts = Partial<GardenOpts> & { noCache?: boolean; noTempDir?: boolean }

export class TestGarden extends Garden {
  events: TestEventBus
  public vcs: VcsHandler // Not readonly, to allow overriding with a mocked handler in tests
  public secrets: StringMap // Not readonly, to allow setting secrets in tests
  public variables: DeepPrimitiveMap // Not readonly, to allow setting variables in tests
  private repoRoot: string
  public cacheKey: string

  constructor(params: GardenParams) {
    super(params)
    this.events = new TestEventBus()
  }

  static async factory<T extends typeof Garden>(
    this: T,
    currentDirectory: string,
    opts?: TestGardenOpts
  ): Promise<InstanceType<T>> {
    // Cache the resolved params to save a bunch of time during tests
    const cacheKey = opts?.noCache
      ? undefined
      : hashString(serializeObject([currentDirectory, { ...opts, log: undefined }]))

    let params: GardenParams

    if (cacheKey && paramCache[cacheKey]) {
      params = cloneDeep(paramCache[cacheKey])
      // Need to do these separately to avoid issues around cloning
      params.log = opts?.log || getLogger().placeholder()
      params.plugins = opts?.plugins || []
    } else {
      params = await resolveGardenParams(currentDirectory, { commandInfo: defaultCommandinfo, ...opts })
      if (cacheKey) {
        paramCache[cacheKey] = cloneDeep({ ...params, log: <any>{}, plugins: [] })
      }
    }

    params.sessionId = uuidv4()

    const garden = new this(params) as InstanceType<T>

    if (pathIsInside(currentDirectory, repoRoot)) {
      garden["repoRoot"] = repoRoot
    }

    garden["cacheKey"] = cacheKey

    return garden
  }

  async processTasks(params: Omit<SolveParams, "log"> & { log?: LogEntry }) {
    return super.processTasks({ ...params, log: params.log || this.log })
  }

  /**
   * Override to cache the config graph.
   */
  async getConfigGraph(params: {
    log: LogEntry
    graphResults?: GraphResults
    emit: boolean
    noCache?: boolean
  }): Promise<ConfigGraph> {
    // TODO-G2: re-instate this after we're done refactoring
    // // We don't try to cache if a runtime context is given (TODO: might revisit that)
    // let cacheKey: string | undefined = undefined

    // if (this.cacheKey && !params.noCache) {
    //   const moduleConfigHash = hashString(serializeObject(await this.getRawModuleConfigs()))
    //   const runtimeContextHash = hashString(serializeObject(params.runtimeContext || {}))
    //   cacheKey = [this.cacheKey, moduleConfigHash, runtimeContextHash].join("-")
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
  async getRepoRoot() {
    if (this.repoRoot) {
      return this.repoRoot
    }
    return await super.getRepoRoot()
  }

  setModuleConfigs(moduleConfigs: PartialModuleConfig[]) {
    this.configsScanned = true
    this.moduleConfigs = keyBy(moduleConfigs.map(moduleConfigWithDefaults), "name")
  }

  setWorkflowConfigs(workflowConfigs: WorkflowConfig[]) {
    this.workflowConfigs = keyBy(workflowConfigs, "name")
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
    log: LogEntry
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
      throw new TestError(`Could not find module config ${name}`, { name, available: getNames(modules) })
    }

    return config
  }
}

export function expectFuzzyMatch(str: string, sample: string | string[]) {
  const errorMessageNonAnsi = stripAnsi(str)
  const samples = typeof sample === "string" ? [sample] : sample
  samples.forEach((s) => expect(errorMessageNonAnsi.toLowerCase()).to.contain(s.toLowerCase()))
}

type ExpectErrorAssertion = string | ((err: any) => void) | { type?: string; contains?: string | string[] }

export function expectError(fn: Function, assertion: ExpectErrorAssertion = {}) {
  const handleError = (err: GardenError) => {
    if (assertion === undefined) {
      return true
    }

    if (typeof assertion === "function") {
      assertion(err)
      return true
    }

    const type = typeof assertion === "string" ? assertion : assertion.type
    const contains = typeof assertion === "object" && assertion.contains

    if (type) {
      if (!err.type) {
        const newError = Error(`Expected GardenError with type ${type}, got: ${err}`)
        newError.stack = err.stack
        throw newError
      }
      if (err.type !== type) {
        const newError = Error(`Expected ${type} error, got: ${err.type} error`)
        newError.stack = err.stack
        throw newError
      }
    }

    if (contains) {
      expectFuzzyMatch(err.message, contains)
    }

    return true
  }

  const handleNonError = (caught: boolean) => {
    if (caught) {
      return
    } else if (typeof assertion === "string") {
      throw new Error(`Expected ${assertion} error (got no error)`)
    } else {
      throw new Error(`Expected error (got no error)`)
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
