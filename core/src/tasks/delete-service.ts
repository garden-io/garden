/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ActionTaskProcessParams, BaseActionTask, BaseActionTaskParams } from "./base"
import { ServiceStatus } from "../types/service"
import { GraphResults, GraphResult } from "../graph/results"
import { DeployAction, isDeployAction } from "../actions/deploy"
import { DeployStatus } from "../plugin/handlers/deploy/get-status"

export interface DeleteDeployTaskParams extends BaseActionTaskParams<DeployAction> {
  /**
   * If true, the task will include delete service tasks for its dependants in its list of dependencies.
   */
  dependantsFirst?: boolean
  /**
   * If not provided, defaults to just `[service.name]`.
   */
  deleteDeployNames?: string[]
}

export class DeleteDeployTask extends BaseActionTask<DeployAction, DeployStatus> {
  type = "delete-service"
  concurrencyLimit = 10
  dependantsFirst: boolean
  deleteDeployNames: string[]

  constructor(params: DeleteDeployTaskParams) {
    super(params)
    this.dependantsFirst = !!params.dependantsFirst
    this.deleteDeployNames = params.deleteDeployNames || [params.action.name]
  }

  resolveDependencies() {
    const resolveTask = this.getResolveTask(this.action)

    if (!this.dependantsFirst) {
      return [resolveTask]
    }

    // Note: We delete in _reverse_ dependency order, so we query for dependants
    const deps = this.graph.getDependants({
      kind: "Deploy",
      name: this.getName(),
      recursive: false,
      filter: (depNode) => depNode.type === "Deploy" && this.deleteDeployNames.includes(depNode.name),
    })

    const depTasks = deps.filter(isDeployAction).map((action) => {
      return new DeleteDeployTask({
        ...this.getBaseDependencyParams(),
        action,
        force: this.force,
        deleteDeployNames: this.deleteDeployNames,
        dependantsFirst: true,
      })
    })

    return [...depTasks, resolveTask]
  }

  getName() {
    return this.action.name
  }

  getDescription() {
    return `deleting service ${this.action.longDescription()})`
  }

  async getStatus() {
    return null
  }

  async process({ dependencyResults }: ActionTaskProcessParams<DeployAction, DeployStatus>) {
    const action = this.getResolvedAction(this.action, dependencyResults)
    const router = await this.garden.getActionRouter()
    let status: DeployStatus

    try {
      status = await router.deploy.delete({ log: this.log, action, graph: this.graph })
    } catch (err) {
      this.log.setError()
      throw err
    }

    return status
  }
}

export function deletedDeployStatuses(results: GraphResults): { [serviceName: string]: ServiceStatus } {
  const deleted = <GraphResult[]>Object.values(results).filter((r) => r && r.type === "delete-service")
  const statuses = {}

  for (const res of deleted) {
    statuses[res.name] = res.result
  }

  return statuses
}
