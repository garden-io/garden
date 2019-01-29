/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { BaseTask } from "../tasks/base"
import { Garden } from "../garden"
import { Task } from "../types/task"
import { BuildTask } from "./build"
import { DeployTask } from "./deploy"
import { LogEntry } from "../logger/log-entry"
import { RunTaskResult } from "../types/plugin/outputs"
import { prepareRuntimeContext } from "../types/service"
import { DependencyGraphNodeType } from "../dependency-graph"

export interface TaskTaskParams {
  garden: Garden
  log: LogEntry
  task: Task
  force: boolean
  forceBuild: boolean
}

export class TaskTask extends BaseTask { // ... to be renamed soon.
  type = "task"
  depType: DependencyGraphNodeType = "task"

  private task: Task
  private forceBuild: boolean

  constructor({ garden, log, task, force, forceBuild }: TaskTaskParams) {
    super({ garden, log, force, version: task.module.version })
    this.task = task
    this.forceBuild = forceBuild
  }

  async getDependencies(): Promise<BaseTask[]> {

    const buildTask = new BuildTask({
      garden: this.garden,
      log: this.log,
      module: this.task.module,
      force: this.forceBuild,
    })

    const dg = await this.garden.getDependencyGraph()
    const deps = await dg.getDependencies(this.depType, this.getName(), false)

    const deployTasks = deps.service.map(service => {
      return new DeployTask({
        service,
        log: this.log,
        garden: this.garden,
        force: false,
        forceBuild: false,
      })
    })

    const taskTasks = deps.task.map(task => {
      return new TaskTask({
        task,
        log: this.log,
        garden: this.garden,
        force: false,
        forceBuild: false,
      })
    })

    return [buildTask, ...deployTasks, ...taskTasks]

  }

  protected getName() {
    return this.task.name
  }

  getDescription() {
    return `running task ${this.task.name} in module ${this.task.module.name}`
  }

  async process() {
    const task = this.task
    const module = task.module

    const log = this.log.info({
      section: task.name,
      msg: "Running",
      status: "active",
    })

    // combine all dependencies for all services in the module, to be sure we have all the context we need
    const dg = await this.garden.getDependencyGraph()
    const serviceDeps = (await dg.getDependencies(this.depType, this.getName(), false)).service
    const runtimeContext = await prepareRuntimeContext(this.garden, module, serviceDeps)

    let result: RunTaskResult
    try {
      result = await this.garden.actions.runTask({
        task,
        log,
        runtimeContext,
        interactive: false,
      })
    } catch (err) {
      log.setError()
      throw err
    }

    log.setSuccess({ msg: chalk.green(`Done (took ${log.getDuration(1)} sec)`), append: true })

    return result

  }

}
