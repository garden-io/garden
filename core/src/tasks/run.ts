/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BaseActionTaskParams, ActionTaskProcessParams, ActionTaskStatusParams, ExecuteActionTask } from "./base"
import { Profile } from "../util/profiling"
import { RunAction } from "../actions/run"
import { GetRunResult } from "../plugin/handlers/Run/get-result"
import { resolvedActionToExecuted } from "../actions/helpers"
import chalk from "chalk"

export interface RunTaskParams extends BaseActionTaskParams<RunAction> {}

class RunTaskError extends Error {
  toString() {
    return this.message
  }
}

@Profile()
export class RunTask extends ExecuteActionTask<RunAction, GetRunResult> {
  type = "run"

  getDescription() {
    return this.action.longDescription()
  }

  async getStatus({ statusOnly, dependencyResults }: ActionTaskStatusParams<RunAction>) {
    const taskLog = this.log.createLog().info("Checking result...")
    const router = await this.garden.getActionRouter()
    const action = this.getResolvedAction(this.action, dependencyResults)

    // The default handler (for plugins that don't implement getTaskResult) returns undefined.
    try {
      const { result: status } = await router.run.getResult({
        graph: this.graph,
        action,
        log: taskLog,
      })
      taskLog.success(`Done`)

      // Should return a null value here if there is no result
      if (status.detail === null) {
        return null
      }

      if (status.state === "ready" && !statusOnly) {
        taskLog.info(chalk.green(`${action.longDescription()} already complete.`))
      }

      return {
        ...status,
        version: action.versionString(),
        executedAction: resolvedActionToExecuted(action, { status }),
      }
    } catch (err) {
      taskLog.error(`Failed getting status`)
      throw err
    }
  }

  async process({ dependencyResults }: ActionTaskProcessParams<RunAction, GetRunResult>) {
    const action = this.getResolvedAction(this.action, dependencyResults)

    const taskLog = this.log.createLog().info("Running...")

    const actions = await this.garden.getActionRouter()

    let status: GetRunResult

    try {
      const output = await actions.run.run({
        graph: this.graph,
        action,
        log: taskLog,
        interactive: false,
      })
      status = output.result
    } catch (err) {
      taskLog.error(`Failed running ${action.name}`)
      throw err
    }
    if (status.state === "ready") {
      taskLog.success(`Done`)
    } else {
      taskLog.error(`Failed!`)
      throw new RunTaskError(status.detail?.log)
    }

    return { ...status, version: action.versionString(), executedAction: resolvedActionToExecuted(action, { status }) }
  }
}
