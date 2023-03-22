/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { find } from "lodash"
import minimatch from "minimatch"

import { BaseActionTaskParams, ActionTaskProcessParams, ExecuteActionTask, ActionTaskStatusParams } from "../tasks/base"
import { Profile } from "../util/profiling"
import { ModuleConfig } from "../config/module"
import { resolvedActionToExecuted } from "../actions/helpers"
import { TestAction } from "../actions/test"
import { GetTestResult } from "../plugin/handlers/Test/get-result"
import { TestConfig } from "../config/test"
import { moduleTestNameToActionName } from "../types/module"

class TestError extends Error {
  toString() {
    return this.message
  }
}

export interface TestTaskParams extends BaseActionTaskParams<TestAction> {
  silent?: boolean
  interactive?: boolean
}

@Profile()
export class TestTask extends ExecuteActionTask<TestAction, GetTestResult> {
  type = "test"

  silent: boolean

  constructor(params: TestTaskParams) {
    super(params)

    const { silent = true, interactive = false } = params

    this.silent = silent
    this.interactive = interactive
  }

  getDescription() {
    return this.action.longDescription()
  }

  async getStatus({ dependencyResults }: ActionTaskStatusParams<TestAction>) {
    const action = this.getResolvedAction(this.action, dependencyResults)
    const router = await this.garden.getActionRouter()

    const { result: status } = await router.test.getResult({
      log: this.log,
      graph: this.graph,
      action,
    })

    const testResult = status?.detail

    if (testResult && testResult.success) {
      this.log.createLog().success("Already passed")
      return {
        ...status,
        version: action.versionString(),
        executedAction: resolvedActionToExecuted(action, { status }),
      }
    }

    return null
  }

  async process({ dependencyResults }: ActionTaskProcessParams<TestAction, GetTestResult>) {
    const action = this.getResolvedAction(this.action, dependencyResults)

    const taskLog = this.log.createLog().info(`Running...`)

    const router = await this.garden.getActionRouter()

    let status: GetTestResult<TestAction>
    try {
      const output = await router.test.run({
        log: taskLog,
        action,
        graph: this.graph,
        silent: this.silent,
        interactive: this.interactive,
      })
      status = output.result
    } catch (err) {
      taskLog.error(`Failed running test`)
      throw err
    }
    if (status.detail?.success) {
      taskLog.success(`Success`)
    } else {
      const exitCode = status.detail?.exitCode
      const failedMsg = !!exitCode ? `Failed with code ${exitCode}!` : `Failed!`
      taskLog.error(`${failedMsg} (took ${taskLog.getDuration(1)} sec)`)
      throw new TestError(status.detail?.log)
    }

    return { ...status, version: action.versionString(), executedAction: resolvedActionToExecuted(action, { status }) }
  }
}

export function filterTestConfigs(module: ModuleConfig, filterNames?: string[]): ModuleConfig["testConfigs"] {
  const acceptableTestConfig = (test: TestConfig) => {
    if (test.disabled) {
      return false
    }
    if (!filterNames || filterNames.length === 0) {
      return true
    }
    const testName = moduleTestNameToActionName(module.name, test.name)
    return find(filterNames, (n: string) => minimatch(testName, n))
  }
  return module.testConfigs.filter(acceptableTestConfig)
}
