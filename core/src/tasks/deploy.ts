/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
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
  emitGetStatusEvents,
  emitProcessingEvents,
} from "./base"
import { getLinkUrl } from "../types/service"
import { Profile } from "../util/profiling"
import type { DeployAction } from "../actions/deploy"
import { DeployStatus } from "../plugin/handlers/Deploy/get-status"
import { displayState, resolvedActionToExecuted } from "../actions/helpers"
import { PluginEventBroker } from "../plugin-context"
import { ActionLog } from "../logger/log-entry"
import { OtelTraced } from "../util/open-telemetry/decorators"

export interface DeployTaskParams extends BaseActionTaskParams<DeployAction> {
  events?: PluginEventBroker
  startSync?: boolean
}

function printIngresses(status: DeployStatus, log: ActionLog) {
  for (const ingress of status.detail?.ingresses || []) {
    log.info(chalk.gray("URL: ") + chalk.underline.gray(getLinkUrl(ingress)))
  }
}

@Profile()
export class DeployTask extends ExecuteActionTask<DeployAction, DeployStatus> {
  type = "deploy" as const
  override concurrencyLimit = 10

  events?: PluginEventBroker
  startSync: boolean

  constructor(params: DeployTaskParams) {
    super(params)
    this.events = params.events
    this.startSync = !!params.startSync
  }

  protected override getDependencyParams(): DeployTaskParams {
    return {
      ...super.getDependencyParams(),
      startSync: this.startSync,
    }
  }

  getDescription() {
    return this.action.longDescription()
  }

  @OtelTraced({
    name(_params) {
      return `${this.action.key()}.getDeployStatus`
    },
    getAttributes(_params) {
      return {
        key: this.action.key(),
        kind: this.action.kind,
      }
    },
  })
  @(emitGetStatusEvents<DeployAction>)
  async getStatus({ statusOnly, dependencyResults }: ActionTaskStatusParams<DeployAction>) {
    const log = this.log.createLog()
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

    if (!statusOnly && !this.force) {
      if (status.state === "ready") {
        log.info("Already deployed")
        printIngresses(status, log)
      } else {
        const state = status.detail?.state || displayState(status.state)
        log.info(state)
      }
    }

    const executedAction = resolvedActionToExecuted(action, { status })

    if (this.startSync && !statusOnly && status.state === "ready" && action.mode() === "sync") {
      // If the action is already deployed, we still need to make sure the sync is started
      await router.deploy.startSync({ log, graph: this.graph, action: executedAction })
    }

    return { ...status, version: action.versionString(), executedAction }
  }

  @OtelTraced({
    name(_params) {
      return `${this.action.key()}.deploy`
    },
    getAttributes(_params) {
      return {
        key: this.action.key(),
        kind: this.action.kind,
      }
    },
  })
  @(emitProcessingEvents<DeployAction>)
  async process({ dependencyResults, status }: ActionTaskProcessParams<DeployAction, DeployStatus>) {
    const action = this.getResolvedAction(this.action, dependencyResults)
    const version = action.versionString()

    const router = await this.garden.getActionRouter()

    const log = this.log.createLog()
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
      log.error(`Failed`)
      throw err
    }

    log.success(`Done`)

    const executedAction = resolvedActionToExecuted(action, { status })

    printIngresses(status, log)

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

export function createDeployTask(params: DeployTaskParams) {
  return new DeployTask(params)
}
