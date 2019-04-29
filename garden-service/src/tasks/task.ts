/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Bluebird from "bluebird"
import chalk from "chalk"
import { BaseTask, TaskParams, TaskType } from "../tasks/base"
import { Garden } from "../garden"
import { Task } from "../types/task"
import { PushTask } from "./push"
import { DeployTask } from "./deploy"
import { LogEntry } from "../logger/log-entry"
import { RunTaskResult } from "../types/plugin/outputs"
import { prepareRuntimeContext } from "../types/service"
import { DependencyGraphNodeType, ConfigGraph } from "../config-graph"
import { ModuleVersion } from "../vcs/vcs"

export interface TaskTaskParams {
  garden: Garden
  log: LogEntry
  graph: ConfigGraph
  task: Task
  force: boolean
  forceBuild: boolean
}

export class TaskTask extends BaseTask { // ... to be renamed soon.
  type: TaskType = "task"
  depType: DependencyGraphNodeType = "task"

  private graph: ConfigGraph
  private task: Task
  private forceBuild: boolean

  constructor({ garden, log, graph, task, version, force, forceBuild }: TaskTaskParams & TaskParams) {
    super({ garden, log, force, version })
    this.graph = graph
    this.task = task
    this.force = force
    this.forceBuild = forceBuild
  }

  static async factory(initArgs: TaskTaskParams): Promise<TaskTask> {
    const { garden, graph, task } = initArgs
    const version = await getTaskVersion(garden, graph, task)
    return new TaskTask({ ...initArgs, version })
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

    const taskTasks = await Bluebird.map(deps.task, (task) => {
      return TaskTask.factory({
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

    // TODO: Re-enable this logic when we've started providing task graph results to process methods.

    // const cachedResult = await this.getTaskReosult()

    // if (cachedResult && cachedResult.success) {
    //   this.log.info({
    //     section: task.name,
    //   }).setSuccess({ msg: chalk.green("Already run") })

    //   return cachedResult
    // }

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
        taskVersion: this.version,
      })
    } catch (err) {
      log.setError()
      throw err
    }

    log.setSuccess({ msg: chalk.green(`Done (took ${log.getDuration(1)} sec)`), append: true })

    return result

  }

  //   private async getTaskResult(): Promise<RunTaskResult | null> {
  //     if (this.force) {
  //       return null
  //     }

  //     return this.garden.actions.getTaskResult({
  //       log: this.log,
  //       task: this.task,
  //       taskVersion: this.version,
  //     })
  //   }

}

/**
 * Determine the version of the task run, based on the version of the module and each of its dependencies.
 */
export async function getTaskVersion(
  garden: Garden, graph: ConfigGraph, task: Task,
): Promise<ModuleVersion> {
  const { module } = task
  const moduleDeps = await graph.resolveDependencyModules(module.build.dependencies, task.config.dependencies)
  return garden.resolveVersion(module.name, moduleDeps)
}
