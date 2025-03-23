/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { BaseActionTaskParams, BaseTask, ActionTaskProcessParams, ActionTaskStatusParams } from "./base.js"
import { ExecuteActionTask, logAndEmitGetStatusEvents, logAndEmitProcessingEvents } from "./base.js"
import { getLinkUrl } from "../types/service.js"
import { Profile } from "../util/profiling.js"
import type { DeployAction } from "../actions/deploy.js"
import type { DeployStatus } from "../plugin/handlers/Deploy/get-status.js"
import { resolvedActionToExecuted } from "../actions/helpers.js"
import type { PluginEventBroker } from "../plugin-context.js"
import type { ActionLog } from "../logger/log-entry.js"
import { OtelTraced } from "../util/open-telemetry/decorators.js"
import { styles } from "../logger/styles.js"
import { makeGetStatusLog } from "./helpers.js"

export interface DeployTaskParams extends BaseActionTaskParams<DeployAction> {
  events?: PluginEventBroker
  startSync?: boolean
}

function printIngresses(status: DeployStatus, log: ActionLog) {
  for (const ingress of status.detail?.ingresses || []) {
    log.info(`Ingress: ${styles.link(getLinkUrl(ingress))}`)
  }
}

@Profile()
export class DeployTask extends ExecuteActionTask<DeployAction, DeployStatus> {
  readonly type = "deploy" as const
  override defaultStatusConcurrencyLimit = 10
  override defaultExecuteConcurrencyLimit = 10

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
  @(logAndEmitGetStatusEvents<DeployAction>)
  async getStatus({ statusOnly, dependencyResults }: ActionTaskStatusParams<DeployAction>) {
    const log = makeGetStatusLog(this.log, this.force)
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

    if (!statusOnly && !this.force && status.state === "ready") {
      printIngresses(status, log)
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
  @(logAndEmitProcessingEvents<DeployAction>)
  async process({ dependencyResults, status }: ActionTaskProcessParams<DeployAction, DeployStatus>) {
    const action = this.getResolvedAction(this.action, dependencyResults)
    const version = action.versionString()

    const router = await this.garden.getActionRouter()

    const log = this.log.createLog()

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
      throw err
    }

    const executedAction = resolvedActionToExecuted(action, { status })

    printIngresses(status, log)

    // Start syncing, if requested
    if (this.startSync && action.mode() === "sync") {
      log.info(styles.primary("Starting sync"))
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
