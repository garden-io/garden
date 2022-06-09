/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { LogEntry } from "../logger/log-entry"
import { BaseTask, TaskType } from "./base"
import { Garden } from "../garden"
import { GardenTask } from "../types/task"
import { RunTaskResult } from "../types/plugin/task/runTask"
import { Profile } from "../util/profiling"
import { ConfigGraph } from "../config-graph"

export interface GetTaskResultTaskParams {
  force: boolean
  garden: Garden
  graph: ConfigGraph
  log: LogEntry
  task: GardenTask
}

@Profile()
export class GetTaskResultTask extends BaseTask {
  type: TaskType = "get-task-result"
  concurrencyLimit = 20
  graph: ConfigGraph
  task: GardenTask

  constructor(params: GetTaskResultTaskParams) {
    super({ ...params, version: params.task.version })
    this.graph = params.graph
    this.task = params.task
  }

  async resolveDependencies() {
    return []
  }

  getName() {
    return this.task.name
  }

  getDescription() {
    return `getting task result '${this.task.name}' (from module '${this.task.module.name}')`
  }

  async process(): Promise<RunTaskResult | null | undefined> {
    const log = this.log.info({
      section: this.task.name,
      msg: "Checking result...",
      status: "active",
    })
    const actions = await this.garden.getActionRouter()

    // The default handler (for plugins that don't implement getTaskResult) returns undefined.
    let result: RunTaskResult | null | undefined
    try {
      result = await actions.getTaskResult({
        graph: this.graph,
        task: this.task,
        log,
      })
    } catch (err) {
      log.setError()
      throw err
    }

    log.setSuccess({ msg: chalk.green(`Done`), append: true })

    return result
  }
}
