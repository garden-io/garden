/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { TaskType, BaseActionTask, BaseActionTaskParams, ActionTaskProcessParams } from "./base"
import { prepareRuntimeContext } from "../runtime-context"
import { Profile } from "../util/profiling"
import { RunAction } from "../actions/run"
import { GetRunResult } from "../plugin/handlers/run/get-result"

export interface RunTaskParams extends BaseActionTaskParams<RunAction> {}

class RunTaskError extends Error {
  toString() {
    return this.message
  }
}

@Profile()
export class RunTask extends BaseActionTask<RunAction, GetRunResult> {
  type: TaskType = "run"

  getDescription() {
    return `running ${this.action.longDescription()}`
  }

  async getStatus() {
    const log = this.log.info({
      section: this.action.name,
      msg: "Checking result...",
      status: "active",
    })
    const actions = await this.garden.getActionRouter()

    // The default handler (for plugins that don't implement getTaskResult) returns undefined.
    try {
      const result = await actions.run.getResult({
        graph: this.graph,
        action: this.action,
        log,
      })
      log.setSuccess({ msg: chalk.green(`Done`), append: true })

      // Should return a null value here if there is no result
      if (result.detail === null) {
        return null
      }

      return result
    } catch (err) {
      log.setError()
      throw err
    }
  }

  async process({ resolvedAction: action, dependencyResults }: ActionTaskProcessParams<RunAction>) {
    const log = this.log.info({
      section: action.key(),
      msg: "Running...",
      status: "active",
    })

    const runtimeContext = await prepareRuntimeContext({
      action,
      graph: this.graph,
      graphResults: dependencyResults,
    })

    const actions = await this.garden.getActionRouter()

    let result: GetRunResult

    try {
      result = await actions.run.run({
        graph: this.graph,
        action,
        log,
        runtimeContext,
        interactive: false,
      })
    } catch (err) {
      log.setError()
      throw err
    }
    if (result.detail?.success) {
      log.setSuccess({
        msg: chalk.green(`Done (took ${log.getDuration(1)} sec)`),
        append: true,
      })
    } else {
      log.setError(`Failed!`)
      throw new RunTaskError(result.detail?.log)
    }

    return result
  }
}
