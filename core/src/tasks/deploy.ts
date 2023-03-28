/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { BaseActionTaskParams, ActionTaskProcessParams, ExecuteActionTask, ActionTaskStatusParams } from "./base"
import { getLinkUrl } from "../types/service"
import { startPortProxies } from "../proxy"
import { Profile } from "../util/profiling"
import { DeployAction } from "../actions/deploy"
import { DeployStatus } from "../plugin/handlers/Deploy/get-status"
import { resolvedActionToExecuted } from "../actions/helpers"

export interface DeployTaskParams extends BaseActionTaskParams<DeployAction> {}

@Profile()
export class DeployTask extends ExecuteActionTask<DeployAction, DeployStatus> {
  type = "deploy"
  concurrencyLimit = 10

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

    const executedAction = resolvedActionToExecuted(action, { status })

    if (this.startSyncs && !statusOnly && status.state === "ready" && action.mode() === "sync") {
      // If the action is already deployed, we still need to make sure the sync is started
      // TODO-G2: instead, return outdated when sync is not already running?

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
    if (this.startSyncs && action.mode() === "sync") {
      log.info(chalk.gray("Starting sync"))
      await router.deploy.startSync({ log, graph: this.graph, action: executedAction })
    }

    if (this.garden.persistent) {
      const proxies = await startPortProxies({
        garden: this.garden,
        graph: this.graph,
        log,
        action: executedAction,
        status: status.detail!,
      })

      for (const proxy of proxies) {
        const targetHost = proxy.spec.targetName || action.name

        log.info(
          chalk.gray(
            `Port forward: ` +
              chalk.underline(proxy.localUrl) +
              ` → ${targetHost}:${proxy.spec.targetPort}` +
              (proxy.spec.name ? ` (${proxy.spec.name})` : "")
          )
        )
      }
    }

    return { ...status, version, executedAction }
  }
}
