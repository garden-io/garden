/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { includes } from "lodash"
import { TaskType, BaseActionTask, BaseActionTaskParams, ActionTaskProcessParams } from "./base"
import { getLinkUrl } from "../types/service"
import { startPortProxies } from "../proxy"
import { prepareRuntimeContext } from "../runtime-context"
import { Profile } from "../util/profiling"
import { DeployAction } from "../actions/deploy"
import { DeployStatus } from "../plugin/handlers/deploy/get-status"

export interface DeployTaskParams extends BaseActionTaskParams<DeployAction> {}

@Profile()
export class DeployTask extends BaseActionTask<DeployAction, DeployStatus> {
  type: TaskType = "deploy"
  concurrencyLimit = 10

  getDescription() {
    return `deploying ${this.action.longDescription()})`
  }

  async getStatus({ resolvedAction: action, dependencyResults }: ActionTaskProcessParams<DeployAction>) {
    const log = this.log.placeholder()

    const devMode = includes(this.devModeDeployNames, action.name)
    const localMode = includes(this.localModeDeployNames, action.name)

    const runtimeContext = await prepareRuntimeContext({
      action,
      graph: this.graph,
      graphResults: dependencyResults,
    })

    const actions = await this.garden.getActionRouter()

    let status: DeployStatus = { state: "unknown", detail: { state: "unknown", detail: {} }, outputs: {} }

    try {
      status = await actions.deploy.getStatus({
        graph: this.graph,
        action,
        log,
        devMode,
        localMode,
        runtimeContext,
      })
    } catch (err) {
      // This can come up if runtime outputs are not resolvable
      if (err.type === "template-string") {
        log.debug(`Unable to resolve status for action ${action.longDescription()}: ${err.message}`)
      } else {
        throw err
      }
    }

    return status
  }

  async process({ resolvedAction: action, dependencyResults, status }: ActionTaskProcessParams<DeployAction>) {
    const version = this.version

    const devMode = includes(this.devModeDeployNames, action.name)
    const localMode = includes(this.localModeDeployNames, action.name)

    // TODO: attach runtimeContext to GetServiceStatusTask output
    const runtimeContext = await prepareRuntimeContext({
      action,
      graph: this.graph,
      graphResults: dependencyResults,
    })

    const actions = await this.garden.getActionRouter()

    const devModeSkipRedeploy = status.devMode && devMode
    const localModeSkipRedeploy = status.localMode && localMode

    const log = this.log.info({
      status: "active",
      section: action.name,
      msg: `Deploying version ${version}...`,
    })

    if (
      !this.force &&
      status.state === "ready" &&
      (version === status.version || devModeSkipRedeploy || localModeSkipRedeploy)
    ) {
      // already deployed and ready
      log.setSuccess({
        msg: chalk.green("Already deployed"),
        append: true,
      })
    } else {
      try {
        const res = await actions.deploy.deploy({
          graph: this.graph,
          action,
          runtimeContext,
          log,
          force: this.force,
          devMode,
          localMode,
        })
        status = res.detail
      } catch (err) {
        log.setError()
        throw err
      }

      log.setSuccess({
        msg: chalk.green(`Done (took ${log.getDuration(1)} sec)`),
        append: true,
      })
    }

    for (const ingress of status.ingresses || []) {
      log.info(chalk.gray("→ Ingress: ") + chalk.underline.gray(getLinkUrl(ingress)))
    }

    if (this.garden.persistent) {
      const proxies = await startPortProxies({
        garden: this.garden,
        graph: this.graph,
        log,
        action,
        status,
      })

      for (const proxy of proxies) {
        const targetHost = proxy.spec.targetName || action.name

        log.info(
          chalk.gray(
            `→ Forward: ` +
              chalk.underline(proxy.localUrl) +
              ` → ${targetHost}:${proxy.spec.targetPort}` +
              (proxy.spec.name ? ` (${proxy.spec.name})` : "")
          )
        )
      }
    }

    return status
  }
}
