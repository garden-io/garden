/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { includes } from "lodash"
import { TaskType, getServiceStatuses, getRunTaskResults, BaseActionTask, BaseActionTaskParams } from "./base"
import { ServiceStatus } from "../types/service"
import { ConfigGraph } from "../graph/config-graph"
import { GraphResults } from "../task-graph"
import { prepareRuntimeContext } from "../runtime-context"
import Bluebird from "bluebird"
import { GetTaskResultTask } from "./get-task-result"
import { Profile } from "../util/profiling"
import { DeployAction, isDeployAction } from "../actions/deploy"
import { isRunAction } from "../actions/run"

export interface GetServiceStatusTaskParams extends BaseActionTaskParams<DeployAction> {
  force: boolean
  devModeDeployNames: string[]
  localModeDeployNames: string[]
}

@Profile()
export class GetServiceStatusTask extends BaseActionTask<DeployAction> {
  type: TaskType = "get-service-status"
  concurrencyLimit = 20

  constructor(params: GetServiceStatusTaskParams) {
    super(params)
  }

  resolveDependencies() {
    const deps = this.graph.getDependencies({ kind: "deploy", name: this.getName(), recursive: false })

    const statusTasks = deps.filter(isDeployAction).map((action) => {
      return new GetServiceStatusTask({
        garden: this.garden,
        graph: this.graph,
        log: this.log,
        action,
        force: false,
        devModeDeployNames: this.devModeDeployNames,
        localModeDeployNames: this.localModeDeployNames,
      })
    })

    const taskResultTasks = await Bluebird.map(deps.filter(isRunAction), async (action) => {
      return new GetTaskResultTask({
        garden: this.garden,
        graph: this.graph,
        log: this.log,
        action,
        force: false,
      })
    })

    return [...statusTasks, ...taskResultTasks]
  }

  getDescription() {
    return `getting status for action ${this.action.longDescription()}`
  }

  async process(dependencyResults: GraphResults): Promise<ServiceStatus> {
    const log = this.log.placeholder()

    const devMode = includes(this.devModeDeployNames, this.action.name)
    const localMode = !devMode && includes(this.localModeDeployNames, this.action.name)

    const dependencies = this.graph.getDependencies({
      kind: "deploy",
      name: this.getName(),
      recursive: false,
    })

    const serviceStatuses = getServiceStatuses(dependencyResults)
    const taskResults = getRunTaskResults(dependencyResults)

    const runtimeContext = await prepareRuntimeContext({
      garden: this.garden,
      graph: this.graph,
      dependencies,
      version: this.version,
      moduleVersion: this.version,
      serviceStatuses,
      taskResults,
    })

    const actions = await this.garden.getActionRouter()

    let status: ServiceStatus = { state: "unknown", detail: {} }

    try {
      status = await actions.deploy.getStatus({
        graph: this.graph,
        action: this.action,
        log,
        devMode,
        localMode,
        runtimeContext,
      })
    } catch (err) {
      // This can come up if runtime outputs are not resolvable
      if (err.type === "template-string") {
        log.debug(`Unable to resolve status for action ${this.action.longDescription()}: ${err.message}`)
      } else {
        throw err
      }
    }

    return status
  }
}
