/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { LogEntry } from "../logger/log-entry"
import { BaseTask, TaskType } from "./base"
import { Garden } from "../garden"
import { Task } from "../types/task"
import { RunTaskResult } from "../types/plugin/task/runTask"
import { ModuleVersion } from "../vcs/vcs"
import { Profile } from "../util/profiling"

export interface GetTaskResultTaskParams {
  force: boolean
  garden: Garden
  log: LogEntry
  task: Task
  version: ModuleVersion
}

@Profile()
export class GetTaskResultTask extends BaseTask {
  type: TaskType = "get-task-result"

  private task: Task

  constructor({ force, garden, log, task, version }: GetTaskResultTaskParams) {
    super({ garden, log, force, version })
    this.task = task
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
        task: this.task,
        log,
        taskVersion: this.version,
      })
    } catch (err) {
      log.setError()
      throw err
    }

    log.setSuccess({ msg: chalk.green(`Done`), append: true })

    return result
  }
}
