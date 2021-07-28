/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { keyBy, isEqual } from "lodash"
import { Garden, GardenOpts, resolveGardenParams } from "../garden"
import { StringMap, DeepPrimitiveMap } from "../config/common"
import { GardenParams } from "../garden"
import { ModuleConfig } from "../config/module"
import { WorkflowConfig } from "../config/workflow"
import { LogEntry } from "../logger/log-entry"
import { RuntimeContext } from "../runtime-context"
import { GardenModule } from "../types/module"
import { findByName, getNames, ValueOf } from "./util"
import { GardenBaseError } from "../exceptions"
import { EventBus, Events } from "../events"
import { dedent } from "./string"

export class TestError extends GardenBaseError {
  type = "_test"
}

export interface EventLogEntry {
  name: string
  payload: ValueOf<Events>
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

export type TestGardenOpts = Partial<GardenOpts>

export class TestGarden extends Garden {
  events: TestEventBus
  public secrets: StringMap // Not readonly, to allow setting secrets in tests
  public variables: DeepPrimitiveMap // Not readonly, to allow setting variables in tests

  constructor(params: GardenParams) {
    super(params)
    this.events = new TestEventBus()
  }

  static async factory<T extends typeof Garden>(
    this: T,
    currentDirectory: string,
    opts?: TestGardenOpts
  ): Promise<InstanceType<T>> {
    const garden = new this(
      await resolveGardenParams(currentDirectory, { commandInfo: defaultCommandinfo, ...opts })
    ) as InstanceType<T>
    await garden.getRepoRoot()
    return garden
  }

  setModuleConfigs(moduleConfigs: ModuleConfig[]) {
    this.configsScanned = true
    this.moduleConfigs = keyBy(moduleConfigs, "name")
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
    runtimeContext,
    includeDisabled = false,
  }: {
    log: LogEntry
    runtimeContext?: RuntimeContext
    includeDisabled?: boolean
  }): Promise<GardenModule[]> {
    const graph = await this.getConfigGraph(log, runtimeContext)
    return graph.getModules({ includeDisabled })
  }

  /**
   * Helper to get a single module. We don't put this on the Garden class because it is highly inefficient
   * and not advisable except for testing.
   */
  async resolveModule(name: string, runtimeContext?: RuntimeContext) {
    const modules = await this.resolveModules({ log: this.log, runtimeContext })
    const config = findByName(modules, name)

    if (!config) {
      throw new TestError(`Could not find module config ${name}`, { name, available: getNames(modules) })
    }

    return config
  }
}
