/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import chalk from "chalk"
import { find } from "lodash"
import minimatch = require("minimatch")

import { GardenModule } from "../types/module"
import { TestResult } from "../types/test"
import { TaskType, getServiceStatuses, getRunTaskResults, BaseActionTask, BaseActionTaskParams } from "../tasks/base"
import { prepareRuntimeContext } from "../runtime-context"
import { Garden } from "../garden"
import { LogEntry } from "../logger/log-entry"
import { ConfigGraph } from "../graph/config-graph"
import { getDeployDeps, getServiceStatusDeps, getTaskDeps, getTaskResultDeps } from "./helpers"
import { BuildTask } from "./build"
import { GraphResults } from "../task-graph"
import { Profile } from "../util/profiling"
import { ModuleConfig } from "../config/module"
import { testFromConfig } from "../types/test"
import { TestAction } from "../actions/test"

class TestError extends Error {
  toString() {
    return this.message
  }
}

export interface TestTaskParams extends BaseActionTaskParams<TestAction> {
  graph: ConfigGraph
  force: boolean
  forceBuild: boolean
  fromWatch?: boolean
  skipRuntimeDependencies?: boolean
  devModeServiceNames: string[]
  localModeServiceNames: string[]
  silent?: boolean
  interactive?: boolean
}

@Profile()
export class TestTask extends BaseActionTask<TestAction> {
  type: TaskType = "test"
  action: TestAction
  graph: ConfigGraph
  forceBuild: boolean
  fromWatch: boolean
  skipRuntimeDependencies: boolean
  devModeServiceNames: string[]
  localModeServiceNames: string[]
  silent: boolean

  constructor({
    garden,
    graph,
    log,
    action,
    force,
    forceBuild,
    fromWatch = false,
    skipRuntimeDependencies = false,
    devModeServiceNames,
    localModeServiceNames,
    silent = true,
    interactive = false,
  }: TestTaskParams) {
    super({ garden, log, force, action })
    this.graph = graph
    this.force = force
    this.forceBuild = forceBuild
    this.fromWatch = fromWatch
    this.skipRuntimeDependencies = skipRuntimeDependencies
    this.devModeServiceNames = devModeServiceNames
    this.localModeServiceNames = localModeServiceNames
    this.silent = silent
    this.interactive = interactive
  }

  async resolveDependencies() {
    const testResult = await this.getTestResult()

    if (testResult && testResult.success) {
      return []
    }

    const deps = this.graph.getDependencies({
      kind: "test",
      name: this.getName(),
      recursive: false,
      filter: (depNode) =>
        !(this.fromWatch && depNode.type === "deploy" && this.devModeServiceNames.includes(depNode.name)),
    })

    const buildTasks = await BuildTask.factory({
      garden: this.garden,
      graph: this.graph,
      log: this.log,
      module: this.test.module,
      force: this.forceBuild,
    })

    if (this.skipRuntimeDependencies) {
      return [...buildTasks, ...getServiceStatusDeps(this, deps), ...getTaskResultDeps(this, deps)]
    } else {
      return [...buildTasks, ...getDeployDeps(this, deps, false), ...getTaskDeps(this, deps, this.force)]
    }
  }

  getDescription() {
    return `running ${this.action.description()}`
  }

  async process(dependencyResults: GraphResults): Promise<TestResult> {
    // find out if module has already been tested
    const testResult = await this.getTestResult()

    if (testResult && testResult.success) {
      const passedEntry = this.log.info({
        section: this.test.module.name,
        msg: `${this.test.name} tests`,
      })
      passedEntry.setSuccess({
        msg: chalk.green("Already passed"),
        append: true,
      })
      return testResult
    }

    const log = this.log.info({
      section: this.test.module.name,
      msg: `Running ${this.test.name} tests`,
      status: "active",
    })

    const dependencies = this.graph.getDependencies({
      kind: "test",
      name: this.test.name,
      recursive: false,
    })
    const serviceStatuses = getServiceStatuses(dependencyResults)
    const taskResults = getRunTaskResults(dependencyResults)

    const runtimeContext = await prepareRuntimeContext({
      garden: this.garden,
      graph: this.graph,
      dependencies,
      version: this.version,
      moduleVersion: this.test.module.version.versionString,
      serviceStatuses,
      taskResults,
    })

    const actions = await this.garden.getActionRouter()

    let result: TestResult
    try {
      result = await actions.test.run({
        log,
        module: this.test.module,
        graph: this.graph,
        runtimeContext,
        silent: this.silent,
        interactive: this.interactive,
        test: this.test,
      })
    } catch (err) {
      log.setError()
      throw err
    }
    if (result.success) {
      log.setSuccess({
        msg: chalk.green(`Success (took ${log.getDuration(1)} sec)`),
        append: true,
      })
    } else {
      const failedMsg = !!result.exitCode ? `Failed with code ${result.exitCode}!` : `Failed!`
      log.setError({
        msg: `${failedMsg} (took ${log.getDuration(1)} sec)`,
        append: true,
      })
      throw new TestError(result.log)
    }

    return result
  }

  private async getTestResult(): Promise<TestResult | null> {
    if (this.force) {
      return null
    }

    const actions = await this.garden.getActionRouter()

    return actions.test.getResult({
      log: this.log,
      graph: this.graph,
      module: this.test.module,
      test: this.test,
    })
  }
}

export async function getTestTasksFromModule({
  garden,
  log,
  graph,
  module,
  filterNames,
  devModeServiceNames,
  localModeServiceNames,
  force = false,
  forceBuild = false,
  fromWatch = false,
  skipRuntimeDependencies = false,
}: {
  garden: Garden
  log: LogEntry
  graph: ConfigGraph
  module: GardenModule
  filterNames?: string[]
  devModeServiceNames: string[]
  localModeServiceNames: string[]
  force?: boolean
  forceBuild?: boolean
  fromWatch?: boolean
  skipRuntimeDependencies?: boolean
}) {
  return Bluebird.map(
    filterTestConfigs(module.testConfigs, filterNames),
    (testConfig) =>
      new TestTask({
        garden,
        graph,
        log,
        force,
        forceBuild,
        fromWatch,
        test: testFromConfig(module, testConfig, graph),
        devModeServiceNames,
        localModeServiceNames,
        skipRuntimeDependencies,
      })
  )
}

export function filterTestConfigs(
  configs: ModuleConfig["testConfigs"],
  filterNames?: string[]
): ModuleConfig["testConfigs"] {
  return configs.filter(
    (test) =>
      !test.disabled &&
      (!filterNames || filterNames.length === 0 || find(filterNames, (n: string) => minimatch(test.name, n)))
  )
}
