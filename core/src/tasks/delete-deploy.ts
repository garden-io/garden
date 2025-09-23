/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ActionTaskProcessParams, BaseActionTaskParams } from "./base.js"
import { BaseActionTask } from "./base.js"
import type { GraphResults } from "../graph/results.js"
import type { DeployAction } from "../actions/deploy.js"
import { isDeployAction } from "../actions/deploy.js"
import type { DeployStatus } from "../plugin/handlers/Deploy/get-status.js"
import { omit } from "lodash-es"

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
  readonly type = "delete-deploy"
  override readonly executeConcurrencyLimit = 10
  override readonly statusConcurrencyLimit = 10

  dependantsFirst: boolean
  deleteDeployNames: string[]

  constructor(params: DeleteDeployTaskParams) {
    super(params)
    this.dependantsFirst = !!params.dependantsFirst
    this.deleteDeployNames = params.deleteDeployNames || [params.action.name]
  }

  protected override getDependencyParams(): DeleteDeployTaskParams {
    return {
      ...super.getDependencyParams(),
      dependantsFirst: this.dependantsFirst,
      deleteDeployNames: this.deleteDeployNames,
    }
  }

  override resolveProcessDependencies() {
    const resolveTask = this.getResolveTask(this.action)

    if (!this.dependantsFirst) {
      return [resolveTask]
    }

    // Note: We delete in _reverse_ dependency order, so we query for dependants
    const deps = this.graph.getDependants({
      kind: "Deploy",
      name: this.getName(),
      recursive: false,
      filter: (depNode) => depNode.kind === "Deploy" && this.deleteDeployNames.includes(depNode.name),
    })

    const depTasks = deps.filter(isDeployAction).map((action) => {
      return new DeleteDeployTask({
        ...this.getDependencyParams(),
        action,
        force: this.force,
        deleteDeployNames: this.deleteDeployNames,
        dependantsFirst: true,
      })
    })

    return [resolveTask, ...depTasks]
  }

  override getName() {
    return this.action.name
  }

  getDescription() {
    return `delete ${this.action.longDescription()})`
  }

  async getStatus() {
    return null
  }

  async process({ dependencyResults }: ActionTaskProcessParams<DeployAction>) {
    const action = this.getResolvedAction(this.action, dependencyResults)
    const router = await this.garden.getActionRouter()
    let status: DeployStatus

    try {
      const output = await router.deploy.delete({ log: this.log, action, graph: this.graph })
      status = output.result
      this.log.info("Done!")
    } catch (err) {
      this.log.error(`Failed deleting ${action.name}`)
      throw err
    }

    return { ...status, version: action.versionString(this.log) }
  }
}

export function deletedDeployStatuses(results: GraphResults): { [serviceName: string]: DeployStatus } {
  const deleted = results.getAll().filter((r) => r && r.type === "delete-deploy")
  const statuses = {}

  for (const res of deleted) {
    if (res) {
      statuses[res.name] = omit(res.result, "version")
    }
  }

  return statuses
}
