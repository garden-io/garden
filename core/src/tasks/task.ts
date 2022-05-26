/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import chalk from "chalk"
import {
  BaseTask,
  TaskType,
  getServiceStatuses,
  getRunTaskResults,
  BaseActionTask,
  BaseActionTaskParams,
  ActionTaskProcessParams,
} from "../tasks/base"
import { DeployTask } from "./deploy"
import { prepareRuntimeContext } from "../runtime-context"
import { BuildTask } from "./build"
import { GraphResults } from "../task-graph"
import { GetTaskResultTask } from "./get-task-result"
import { Profile } from "../util/profiling"
import { RunAction } from "../actions/run"

export interface RunTaskParams extends BaseActionTaskParams<RunAction> {}

class RunTaskError extends Error {
  toString() {
    return this.message
  }
}

@Profile()
export class RunTask extends BaseActionTask<RunAction> {
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
        devModeDeployNames: this.devModeDeployNames,
        localModeDeployNames: this.localModeDeployNames,
      })
      log.setSuccess({ msg: chalk.green(`Done`), append: true })

      // Should return a null value here if there is no result
      if (result.result === null) {
        return null
      }

      return result
    } catch (err) {
      log.setError()
      throw err
    }
  }

  async process({ resolvedAction: action, dependencyResults }: ActionTaskProcessParams<RunAction>) {
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
