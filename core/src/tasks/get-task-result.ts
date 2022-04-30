/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { BaseActionTask, BaseActionTaskParams, TaskType } from "./base"
import { Profile } from "../util/profiling"
import { RunAction } from "../actions/run"

export interface GetTaskResultTaskParams extends BaseActionTaskParams<RunAction> {
  force: boolean
}

@Profile()
export class GetTaskResultTask extends BaseActionTask<RunAction> {
  type: TaskType = "get-task-result"
  concurrencyLimit = 20

  constructor(params: GetTaskResultTaskParams) {
    super({ ...params })
    this.graph = params.graph
  }

  async resolveDependencies() {
    return []
  }

  getDescription() {
    return `getting result for action ${this.action.longDescription()})`
  }

  async process() {
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
      return result
    } catch (err) {
      log.setError()
      throw err
    }
  }
}
