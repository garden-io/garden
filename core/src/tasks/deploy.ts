/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import {
  BaseActionTaskParams,
  ActionTaskProcessParams,
  ExecuteActionTask,
  ActionTaskStatusParams,
  BaseTask,
} from "./base"
import { getLinkUrl } from "../types/service"
import { Profile } from "../util/profiling"
import { DeployAction } from "../actions/deploy"
import { DeployStatus } from "../plugin/handlers/Deploy/get-status"
import { displayState, resolvedActionToExecuted } from "../actions/helpers"
import { PluginEventBroker } from "../plugin-context"

export interface DeployTaskParams extends BaseActionTaskParams<DeployAction> {
  events?: PluginEventBroker
  startSync?: boolean
}

@Profile()
export class DeployTask extends ExecuteActionTask<DeployAction, DeployStatus> {
  type = "deploy"
  concurrencyLimit = 10

  events?: PluginEventBroker
  startSync: boolean

  constructor(params: DeployTaskParams) {
    super(params)
    this.events = params.events
    this.startSync = !!params.startSync
  }

  getDescription() {
    return this.action.longDescription()
  }

  async getStatus({ statusOnly, dependencyResults }: ActionTaskStatusParams<DeployAction>) {
    const log = this.log.createLog({})
    const action = this.getResolvedAction(this.action, dependencyResults)

    const router = await this.garden.getActionRouter()

    const { result: status } = await router.deploy.getStatus({
      graph: this.graph,
      action,
      log,
    })

    if (status.state === "ready" && status.detail?.mode !== action.mode()) {
      status.state = "not-ready"
    }

    if (!statusOnly) {
      if (status.state === "ready") {
        log.info(chalk.green(`${action.longDescription()} is already deployed.`))
      } else {
        const state = status.detail?.state || displayState(status.state)
        log.info(chalk.green(`${action.longDescription()} is ${state}.`))
      }
    }

    const executedAction = resolvedActionToExecuted(action, { status })

    if (this.startSync && !statusOnly && status.state === "ready" && action.mode() === "sync") {
      // If the action is already deployed, we still need to make sure the sync is started
      await router.deploy.startSync({ log, graph: this.graph, action: executedAction })
    }

    return { ...status, version: action.versionString(), executedAction }
  }

  async process({ dependencyResults, status }: ActionTaskProcessParams<DeployAction, DeployStatus>) {
    const action = this.getResolvedAction(this.action, dependencyResults)
    const version = action.versionString()

    const router = await this.garden.getActionRouter()

    const log = this.log.createLog().info(`Deploying version ${version}...`)
    log.info(`Deploying version ${version}...`)

    try {
      const output = await router.deploy.deploy({
        graph: this.graph,
        action,
        log,
        force: this.force,
        events: this.events,
      })
      status = output.result
    } catch (err) {
      log.error(`Error deploying ${action.name}`)
      throw err
    }

    log.success(`Done`)

    const executedAction = resolvedActionToExecuted(action, { status })

    for (const ingress of status.detail?.ingresses || []) {
      log.info(chalk.gray("Ingress: ") + chalk.underline.gray(getLinkUrl(ingress)))
    }

    // Start syncing, if requested
    if (this.startSync && action.mode() === "sync") {
      log.info(chalk.gray("Starting sync"))
      await router.deploy.startSync({ log, graph: this.graph, action: executedAction })
    }

    return { ...status, version, executedAction }
  }
}

export function isDeployTask(task: BaseTask): task is DeployTask {
  return task.type === "deploy"
}
