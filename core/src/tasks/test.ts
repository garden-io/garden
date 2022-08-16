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

import { BaseActionTaskParams, ActionTaskProcessParams, ExecuteActionTask, ActionTaskStatusParams } from "../tasks/base"
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
export class TestTask extends ExecuteActionTask<TestAction, GetTestResult> {
  type = "test"

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
    return this.action.longDescription()
  }

  async getStatus({ dependencyResults }: ActionTaskStatusParams<TestAction>) {
    const action = this.getResolvedAction(this.action, dependencyResults)
    const router = await this.garden.getActionRouter()

    const status = await router.test.getResult({
      log: this.log,
      graph: this.graph,
      action,
    })

    const testResult = status?.detail

    if (testResult && testResult.success) {
      const passedEntry = this.log.info({
        section: action.key(),
        msg: chalk.green("Already passed"),
      })
      passedEntry.setSuccess({
        msg: chalk.green("Already passed"),
        append: true,
      })
      return { ...status, executedAction: action.execute({ status }) }
    }

    return null
  }

  async process({ dependencyResults }: ActionTaskProcessParams<TestAction, GetTestResult>) {
    const action = this.getResolvedAction(this.action, dependencyResults)

    const log = this.log.info({
      section: action.key(),
      msg: `Running...`,
      status: "active",
    })

    const runtimeContext = await prepareRuntimeContext({
      action,
      graph: this.graph,
      graphResults: dependencyResults,
    })

    const router = await this.garden.getActionRouter()

    let status: GetTestResult<TestAction>
    try {
      status = await router.test.run({
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
    if (status.detail?.success) {
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
      throw new TestError(status.detail?.log)
    }

    return { ...status, executedAction: action.execute({ status }) }
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
