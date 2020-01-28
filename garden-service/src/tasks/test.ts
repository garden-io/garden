/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import chalk from "chalk"
import { find, includes } from "lodash"
import minimatch = require("minimatch")

import { Module } from "../types/module"
import { TestConfig } from "../config/test"
import { ModuleVersion } from "../vcs/vcs"
import { DeployTask } from "./deploy"
import { TestResult } from "../types/plugin/module/getTestResult"
import { BaseTask, TaskParams, TaskType, getServiceStatuses, getRunTaskResults } from "../tasks/base"
import { prepareRuntimeContext } from "../runtime-context"
import { Garden } from "../garden"
import { LogEntry } from "../logger/log-entry"
import { ConfigGraph } from "../config-graph"
import { makeTestTaskName } from "./helpers"
import { BuildTask } from "./build"
import { TaskTask } from "./task"
import { TaskResults } from "../task-graph"

class TestError extends Error {
  toString() {
    return this.message
  }
}

export interface TestTaskParams {
  garden: Garden
  log: LogEntry
  graph: ConfigGraph
  module: Module
  testConfig: TestConfig
  force: boolean
  forceBuild: boolean
  hotReloadServiceNames?: string[]
}

export class TestTask extends BaseTask {
  type: TaskType = "test"

  private module: Module
  private graph: ConfigGraph
  private testConfig: TestConfig
  private forceBuild: boolean
  private hotReloadServiceNames: string[]

  constructor({
    garden,
    graph,
    log,
    module,
    testConfig,
    force,
    forceBuild,
    version,
    hotReloadServiceNames = [],
  }: TestTaskParams & TaskParams & { _guard: true }) {
    // Note: The _guard attribute is to prevent accidentally bypassing the factory method
    super({ garden, log, force, version })
    this.module = module
    this.graph = graph
    this.testConfig = testConfig
    this.force = force
    this.forceBuild = forceBuild
    this.hotReloadServiceNames = hotReloadServiceNames
  }

  static async factory(initArgs: TestTaskParams): Promise<TestTask> {
    const { garden, graph, module, testConfig } = initArgs
    const version = await getTestVersion(garden, graph, module, testConfig)
    return new TestTask({ ...initArgs, version, _guard: true })
  }

  async getDependencies() {
    const testResult = await this.getTestResult()

    if (testResult && testResult.success) {
      return []
    }

    const dg = this.graph
    const deps = await dg.getDependencies({
      nodeType: "test",
      name: this.getName(),
      recursive: false,
      filterFn: (depNode) => !(depNode.type === "deploy" && includes(this.hotReloadServiceNames, depNode.name)),
    })

    const buildTasks = await BuildTask.factory({
      garden: this.garden,
      log: this.log,
      module: this.module,
      force: this.forceBuild,
    })

    const taskTasks = await Bluebird.map(deps.run, (task) => {
      return TaskTask.factory({
        task,
        garden: this.garden,
        log: this.log,
        graph: this.graph,
        force: this.force,
        forceBuild: this.forceBuild,
      })
    })

    const deployTasks = deps.deploy.map(
      (service) =>
        new DeployTask({
          garden: this.garden,
          graph: this.graph,
          log: this.log,
          service,
          force: false,
          forceBuild: this.forceBuild,
        })
    )

    return [...buildTasks, ...deployTasks, ...taskTasks]
  }

  getName() {
    return makeTestTaskName(this.module.name, this.testConfig.name)
  }

  getDescription() {
    return `running ${this.testConfig.name} tests in module ${this.module.name}`
  }

  async process(dependencyResults: TaskResults): Promise<TestResult> {
    // find out if module has already been tested
    const testResult = await this.getTestResult()

    if (testResult && testResult.success) {
      const passedEntry = this.log.info({
        section: this.module.name,
        msg: `${this.testConfig.name} tests`,
      })
      passedEntry.setSuccess({
        msg: chalk.green("Already passed"),
        append: true,
      })
      return testResult
    }

    const log = this.log.info({
      section: this.module.name,
      msg: `Running ${this.testConfig.name} tests`,
      status: "active",
    })

    const dependencies = await this.graph.getDependencies({
      nodeType: "test",
      name: this.testConfig.name,
      recursive: false,
    })
    const serviceStatuses = getServiceStatuses(dependencyResults)
    const taskResults = getRunTaskResults(dependencyResults)

    const runtimeContext = await prepareRuntimeContext({
      garden: this.garden,
      graph: this.graph,
      dependencies,
      version: this.module.version,
      serviceStatuses,
      taskResults,
    })

    const actions = await this.garden.getActionRouter()

    let result: TestResult
    try {
      result = await actions.testModule({
        log,
        interactive: false,
        module: this.module,
        runtimeContext,
        silent: true,
        testConfig: this.testConfig,
        testVersion: this.version,
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
      log.setError({
        msg: chalk.red(`Failed! (took ${log.getDuration(1)} sec)`),
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

    return actions.getTestResult({
      log: this.log,
      module: this.module,
      testName: this.testConfig.name,
      testVersion: this.version,
    })
  }
}

export async function getTestTasks({
  garden,
  log,
  graph,
  module,
  filterNames,
  hotReloadServiceNames,
  force = false,
  forceBuild = false,
}: {
  garden: Garden
  log: LogEntry
  graph: ConfigGraph
  module: Module
  filterNames?: string[]
  hotReloadServiceNames?: string[]
  force?: boolean
  forceBuild?: boolean
}) {
  // If there are no filters we return the test otherwise
  // we check if the test name matches against the filterNames array
  const configs = module.testConfigs.filter(
    (test) =>
      !test.disabled &&
      (!filterNames || filterNames.length === 0 || find(filterNames, (n: string) => minimatch(test.name, n)))
  )

  return Bluebird.map(configs, (test) =>
    TestTask.factory({
      garden,
      graph,
      log,
      force,
      forceBuild,
      testConfig: test,
      module,
      hotReloadServiceNames,
    })
  )
}

/**
 * Determine the version of the test run, based on the version of the module and each of its dependencies.
 */
export async function getTestVersion(
  garden: Garden,
  graph: ConfigGraph,
  module: Module,
  testConfig: TestConfig
): Promise<ModuleVersion> {
  const moduleDeps = (await graph.resolveDependencyModules(module.build.dependencies, testConfig.dependencies))
    // Don't include the module itself in the dependencies here
    .filter((m) => m.name !== module.name)

  return garden.resolveVersion(module, moduleDeps)
}
