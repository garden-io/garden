/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import chalk from "chalk"
import { BaseTask, TaskParams, TaskType, getServiceStatuses, getRunTaskResults } from "../tasks/base"
import { Garden } from "../garden"
import { Task } from "../types/task"
import { DeployTask } from "./deploy"
import { LogEntry } from "../logger/log-entry"
import { prepareRuntimeContext } from "../runtime-context"
import { ConfigGraph } from "../config-graph"
import { ModuleVersion } from "../vcs/vcs"
import { BuildTask } from "./build"
import { RunTaskResult } from "../types/plugin/task/runTask"
import { TaskResults } from "../task-graph"
import { GetTaskResultTask } from "./get-task-result"

export interface TaskTaskParams {
  garden: Garden
  log: LogEntry
  graph: ConfigGraph
  task: Task
  force: boolean
  forceBuild: boolean
}

export class TaskTask extends BaseTask {
  // ... to be renamed soon.
  type: TaskType = "task"

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
    const buildTasks = await BuildTask.factory({
      garden: this.garden,
      log: this.log,
      module: this.task.module,
      force: this.forceBuild,
    })

    const dg = await this.garden.getConfigGraph(this.log)
    const deps = await dg.getDependencies({ nodeType: "run", name: this.getName(), recursive: false })

    const deployTasks = deps.deploy.map((service) => {
      return new DeployTask({
        service,
        log: this.log,
        garden: this.garden,
        graph: this.graph,
        force: false,
        forceBuild: false,
      })
    })

    const taskTasks = await Bluebird.map(deps.run, (task) => {
      return TaskTask.factory({
        task,
        log: this.log,
        garden: this.garden,
        graph: this.graph,
        force: false,
        forceBuild: false,
      })
    })

    const resultTask = new GetTaskResultTask({
      force: this.force,
      garden: this.garden,
      log: this.log,
      task: this.task,
      version: this.version,
    })

    return [...buildTasks, ...deployTasks, ...taskTasks, resultTask]
  }

  getName() {
    return this.task.name
  }

  getDescription() {
    return `running task ${this.task.name} in module ${this.task.module.name}`
  }

  async process(dependencyResults: TaskResults) {
    const task = this.task

    // TODO: Re-enable this logic when we've started providing task graph results to process methods.

    if (!this.force) {
      const cachedResult = getRunTaskResults(dependencyResults)[this.task.name]

      if (cachedResult && cachedResult.success) {
        this.log
          .info({
            section: task.name,
          })
          .setSuccess({ msg: chalk.green("Already run") })

        return cachedResult
      }
    }

    const log = this.log.info({
      section: task.name,
      msg: "Running...",
      status: "active",
    })

    const dependencies = await this.graph.getDependencies({ nodeType: "run", name: this.getName(), recursive: false })

    const serviceStatuses = getServiceStatuses(dependencyResults)
    const taskResults = getRunTaskResults(dependencyResults)

    const runtimeContext = await prepareRuntimeContext({
      garden: this.garden,
      graph: this.graph,
      dependencies,
      module: this.task.module,
      serviceStatuses,
      taskResults,
    })

    const actions = await this.garden.getActionRouter()

    let result: RunTaskResult
    try {
      result = await actions.runTask({
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

    log.setSuccess({
      msg: chalk.green(`Done (took ${log.getDuration(1)} sec)`),
      append: true,
    })

    return result
  }
}

/**
 * Determine the version of the task run, based on the version of the module and each of its dependencies.
 */
export async function getTaskVersion(garden: Garden, graph: ConfigGraph, task: Task): Promise<ModuleVersion> {
  const { module } = task
  const moduleDeps = await graph.resolveDependencyModules(module.build.dependencies, task.config.dependencies)
  return garden.resolveVersion(module, moduleDeps)
}
