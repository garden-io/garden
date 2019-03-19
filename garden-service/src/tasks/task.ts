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
import { PushTask } from "./push"
import { DeployTask } from "./deploy"
import { LogEntry } from "../logger/log-entry"
import { RunTaskResult } from "../types/plugin/outputs"
import { prepareRuntimeContext } from "../types/service"
import { DependencyGraphNodeType, ConfigGraph } from "../config-graph"

export interface TaskTaskParams {
  garden: Garden
  log: LogEntry
  graph: ConfigGraph
  task: Task
  force: boolean
  forceBuild: boolean
}

export class TaskTask extends BaseTask { // ... to be renamed soon.
  type = "task"
  depType: DependencyGraphNodeType = "task"

  private graph: ConfigGraph
  private task: Task
  private forceBuild: boolean

  constructor({ garden, log, graph, task, force, forceBuild }: TaskTaskParams) {
    super({ garden, log, force, version: task.module.version })
    this.graph = graph
    this.task = task
    this.forceBuild = forceBuild
  }

  async getDependencies(): Promise<BaseTask[]> {

    const pushTask = new PushTask({
      garden: this.garden,
      log: this.log,
      module: this.task.module,
      force: this.forceBuild,
    })

    const dg = await this.garden.getConfigGraph()
    const deps = await dg.getDependencies(this.depType, this.getName(), false)

    const deployTasks = deps.service.map(service => {
      return new DeployTask({
        service,
        log: this.log,
        garden: this.garden,
        graph: this.graph,
        force: false,
        forceBuild: false,
      })
    })

    const taskTasks = deps.task.map(task => {
      return new TaskTask({
        task,
        log: this.log,
        garden: this.garden,
        graph: this.graph,
        force: false,
        forceBuild: false,
      })
    })

    return [pushTask, ...deployTasks, ...taskTasks]

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
    const serviceDeps = (await this.graph.getDependencies(this.depType, this.getName(), false)).service
    const runtimeContext = await prepareRuntimeContext(this.garden, this.graph, module, serviceDeps)

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
