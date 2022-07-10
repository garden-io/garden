/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { find } from "lodash"
import minimatch = require("minimatch")

import {
  TaskType,
  getServiceStatuses,
  getRunTaskResults,
  BaseActionTask,
  BaseActionTaskParams,
  ActionTaskProcessParams,
} from "../tasks/base"
import { prepareRuntimeContext } from "../runtime-context"
import { Profile } from "../util/profiling"
import { ModuleConfig } from "../config/module"
import { TestAction } from "../actions/test"
import { GetTestResult } from "../plugin/handlers/test/get-result"

class TestError extends Error {
  toString() {
    return this.message
  }
}

export interface TestTaskParams extends BaseActionTaskParams<TestAction> {
  skipRuntimeDependencies?: boolean
  devModeDeployNames: string[]
  localModeDeployNames: string[]
  silent?: boolean
  interactive?: boolean
}

@Profile()
export class TestTask extends BaseActionTask<TestAction> {
  type: TaskType = "test"

  skipRuntimeDependencies: boolean
  silent: boolean

  constructor(params: TestTaskParams) {
    super(params)

    const { skipRuntimeDependencies = false, silent = true, interactive = false } = params

    this.skipRuntimeDependencies = skipRuntimeDependencies
    this.silent = silent
    this.interactive = interactive
  }

  // resolveDependencies() {
  //   if (this.skipRuntimeDependencies) {
  //     return [...buildTasks, ...getServiceStatusDeps(this, deps), ...getTaskResultDeps(this, deps)]
  //   } else {
  //     return [...buildTasks, ...getDeployDeps(this, deps, false), ...getTaskDeps(this, deps, this.force)]
  //   }
  // }

  getDescription() {
    return `running ${this.action.longDescription()}`
  }

  async getStatus({}: ActionTaskProcessParams<TestAction>) {
    const result = await this.getTestResult()
    const testResult = result?.result

    if (testResult && testResult.success) {
      const passedEntry = this.log.info({
        section: this.action.key(),
        msg: chalk.green("Already passed"),
      })
      passedEntry.setSuccess({
        msg: chalk.green("Already passed"),
        append: true,
      })
      return testResult
    }

    return null
  }

  async process({ resolvedAction: action, dependencyResults }: ActionTaskProcessParams<TestAction>) {
    const log = this.log.info({
      section: action.key(),
      msg: `Running...`,
      status: "active",
    })

    const dependencies = this.graph.getDependencies({
      kind: "test",
      name: action.name,
      recursive: false,
    })
    const serviceStatuses = getServiceStatuses(dependencyResults)
    const taskResults = getRunTaskResults(dependencyResults)

    const runtimeContext = await prepareRuntimeContext({
      garden: this.garden,
      graph: this.graph,
      dependencies,
      version: this.version,
      moduleVersion: action.moduleVersion().versionString,
      serviceStatuses,
      taskResults,
    })

    const actions = await this.garden.getActionRouter()

    let result: GetTestResult<TestAction>
    try {
      result = await actions.test.run({
        log,
        action,
        graph: this.graph,
        runtimeContext,
        silent: this.silent,
        interactive: this.interactive,
      })
    } catch (err) {
      log.setError()
      throw err
    }
    if (result.result?.success) {
      log.setSuccess({
        msg: chalk.green(`Success (took ${log.getDuration(1)} sec)`),
        append: true,
      })
    } else {
      log.setError({
        msg: chalk.red(`Failed! (took ${log.getDuration(1)} sec)`),
        append: true,
      })
      throw new TestError(result.result?.log)
    }

    return result
  }

  private async getTestResult(): Promise<GetTestResult<TestAction> | null> {
    if (this.force) {
      return null
    }

    const router = await this.garden.getActionRouter()

    return router.test.getResult({
      log: this.log,
      graph: this.graph,
      action: this.action,
    })
  }
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
