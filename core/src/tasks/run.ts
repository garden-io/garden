/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { BaseActionTaskParams, ActionTaskProcessParams, ActionTaskStatusParams, ExecuteActionTask } from "./base"
import { Profile } from "../util/profiling"
import { RunAction } from "../actions/run"
import { GetRunResult } from "../plugin/handlers/Run/get-result"
import { resolvedActionToExecuted } from "../actions/helpers"

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

  async getStatus({ dependencyResults }: ActionTaskStatusParams<RunAction>) {
    const taskLog = this.log
      .makeNewLogContext({
        section: this.action.name,
      })
      .info("Checking result...")
    const router = await this.garden.getActionRouter()
    const action = this.getResolvedAction(this.action, dependencyResults)

    // The default handler (for plugins that don't implement getTaskResult) returns undefined.
    try {
      const status = await router.run.getResult({
        graph: this.graph,
        action,
        log: taskLog,
      })
      taskLog.setSuccess(chalk.green(`Done`))

      // Should return a null value here if there is no result
      if (status.detail === null) {
        return null
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

    const taskLog = this.log
      .makeNewLogContext({
        section: action.key(),
      })
      .info("Running...")

    const actions = await this.garden.getActionRouter()

    let status: GetRunResult

    try {
      status = await actions.run.run({
        graph: this.graph,
        action,
        log: taskLog,
        interactive: false,
      })
    } catch (err) {
      taskLog.error(`Failed running ${action.name}`)
      throw err
    }
    if (status.state === "ready") {
      taskLog.setSuccess(chalk.green(`Done (took ${taskLog.getDuration(1)} sec)`))
    } else {
      taskLog.error(`Failed!`)
      throw new RunTaskError(status.detail?.log)
    }

    return { ...status, version: action.versionString(), executedAction: resolvedActionToExecuted(action, { status }) }
  }
}
