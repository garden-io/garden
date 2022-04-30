/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import chalk from "chalk"
import { BaseTask, TaskType, getServiceStatuses, getRunTaskResults, BaseActionTask, BaseActionTaskParams } from "../tasks/base"
import { Garden } from "../garden"
import { GardenTask } from "../types/task"
import { DeployTask } from "./deploy"
import { LogEntry } from "../logger/log-entry"
import { prepareRuntimeContext } from "../runtime-context"
import { ConfigGraph } from "../graph/config-graph"
import { BuildTask } from "./build"
import { GraphResults } from "../task-graph"
import { GetTaskResultTask } from "./get-task-result"
import { Profile } from "../util/profiling"
import { RunAction } from "../actions/run"

export interface TaskTaskParams extends BaseActionTaskParams<RunAction> {
  forceBuild: boolean
  devModeDeployNames: string[]
  localModeDeployNames: string[]
}

class RunTaskError extends Error {
  toString() {
    return this.message
  }
}

@Profile()
export class RunTask extends BaseActionTask<RunAction> {
  type: TaskType = "run"

  forceBuild: boolean
  localModeDeployNames: string[]

  constructor(params: TaskTaskParams) {
    super(params)
    this.forceBuild = params.forceBuild
    this.devModeDeployNames = params.devModeDeployNames
    this.localModeDeployNames = params.localModeDeployNames
  }

  async resolveDependencies(): Promise<BaseTask[]> {
    const buildTasks = await BuildTask.factory({
      garden: this.garden,
      graph: this.graph,
      log: this.log,
      module: this.task.module,
      force: this.forceBuild,
    })

    const deps = this.graph.getDependencies({ kind: "run", name: this.getName(), recursive: false })

    const deployTasks = deps.deploy.map((service) => {
      return new DeployTask({
        service,
        log: this.log,
        garden: this.garden,
        graph: this.graph,
        force: false,
        forceBuild: false,
        devModeDeployNames: this.devModeDeployNames,
        localModeDeployNames: this.localModeDeployNames,
      })
    })

    const taskTasks = await Bluebird.map(deps.run, (task) => {
      return new RunTask({
        task,
        log: this.log,
        garden: this.garden,
        graph: this.graph,
        force: false,
        forceBuild: false,
        devModeDeployNames: this.devModeDeployNames,
        localModeDeployNames: this.localModeDeployNames,
      })
    })

    const resultTask = new GetTaskResultTask({
      force: this.force,
      garden: this.garden,
      graph: this.graph,
      log: this.log,
      task: this.task,
    })

    return [...buildTasks, ...deployTasks, ...taskTasks, resultTask]
  }

  getDescription() {
    return `running ${this.action.longDescription()}`
  }

  async process(dependencyResults: GraphResults) {
    const action = this.action

    if (!this.force && action.getConfig("cacheResult")) {
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

    const dependencies = this.graph.getDependencies({ kind: "run", name: this.getName(), recursive: false })

    const serviceStatuses = getServiceStatuses(dependencyResults)
    const taskResults = getRunTaskResults(dependencyResults)

    const runtimeContext = await prepareRuntimeContext({
      garden: this.garden,
      graph: this.graph,
      dependencies,
      version: this.task.version,
      moduleVersion: this.task.module.version.versionString,
      serviceStatuses,
      taskResults,
    })

    const actions = await this.garden.getActionRouter()

    let result: RunTaskResult
    try {
      result = await actions.run.run({
        graph: this.graph,
        task,
        log,
        runtimeContext,
        interactive: false,
      })
    } catch (err) {
      log.setError()
      throw err
    }
    if (result.success) {
      log.setSuccess({
        msg: chalk.green(`Done (took ${log.getDuration(1)} sec)`),
        append: true,
      })
    } else {
      log.setError(`Failed!`)
      throw new RunTaskError(result.log)
    }

    return result
  }
}
