/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import chalk from "chalk"
import { find, includes } from "lodash"
import minimatch = require("minimatch")

import { GardenModule } from "../types/module"
import { DeployTask } from "./deploy"
import { TestResult } from "../types/plugin/module/getTestResult"
import { BaseTask, TaskType, getServiceStatuses, getRunTaskResults } from "../tasks/base"
import { prepareRuntimeContext } from "../runtime-context"
import { Garden } from "../garden"
import { LogEntry } from "../logger/log-entry"
import { ConfigGraph } from "../config-graph"
import { makeTestTaskName } from "./helpers"
import { BuildTask } from "./build"
import { TaskTask } from "./task"
import { GraphResults } from "../task-graph"
import { Profile } from "../util/profiling"
import { GardenTest, testFromConfig } from "../types/test"

class TestError extends Error {
  toString() {
    return this.message
  }
}

export interface TestTaskParams {
  garden: Garden
  log: LogEntry
  graph: ConfigGraph
  test: GardenTest
  force: boolean
  forceBuild: boolean
  hotReloadServiceNames?: string[]
}

@Profile()
export class TestTask extends BaseTask {
  type: TaskType = "test"

  private test: GardenTest
  private graph: ConfigGraph
  private forceBuild: boolean
  private hotReloadServiceNames: string[]

  constructor({ garden, graph, log, test, force, forceBuild, hotReloadServiceNames = [] }: TestTaskParams) {
    super({ garden, log, force, version: test.version })
    this.test = test
    this.graph = graph
    this.force = force
    this.forceBuild = forceBuild
    this.hotReloadServiceNames = hotReloadServiceNames
  }

  async resolveDependencies() {
    const testResult = await this.getTestResult()

    if (testResult && testResult.success) {
      return []
    }

    const deps = this.graph.getDependencies({
      nodeType: "test",
      name: this.getName(),
      recursive: false,
      filter: (depNode) => !(depNode.type === "deploy" && includes(this.hotReloadServiceNames, depNode.name)),
    })

    const buildTasks = await BuildTask.factory({
      garden: this.garden,
      graph: this.graph,
      log: this.log,
      module: this.test.module,
      force: this.forceBuild,
    })

    const taskTasks = await Bluebird.map(deps.run, (task) => {
      return new TaskTask({
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
    return makeTestTaskName(this.test.module.name, this.test.name)
  }

  getDescription() {
    return `running ${this.test.name} tests in module ${this.test.module.name}`
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
      nodeType: "test",
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
      result = await actions.testModule({
        log,
        interactive: false,
        module: this.test.module,
        runtimeContext,
        silent: true,
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
      module: this.test.module,
      test: this.test,
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
  module: GardenModule
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

  return Bluebird.map(
    configs,
    (testConfig) =>
      new TestTask({
        garden,
        graph,
        log,
        force,
        forceBuild,
        test: testFromConfig(module, testConfig),
        hotReloadServiceNames,
      })
  )
}
