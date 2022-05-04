/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { includes } from "lodash"
import { LogEntry } from "../logger/log-entry"
import { TaskType, getServiceStatuses, getRunTaskResults, BaseActionTask, BaseActionTaskParams } from "./base"
import { ServiceStatus, getLinkUrl } from "../types/service"
import { startPortProxies } from "../proxy"
import { GraphResults } from "../task-graph"
import { prepareRuntimeContext } from "../runtime-context"
import { GetServiceStatusTask } from "./get-service-status"
import { Profile } from "../util/profiling"
import { getServiceStatusDeps, getTaskResultDeps, getDeployDeps, getTaskDeps } from "./helpers"
import { DeployAction } from "../actions/deploy"

export interface DeployTaskParams extends BaseActionTaskParams<DeployAction> {
  force: boolean
  forceBuild: boolean
  fromWatch: boolean
  log: LogEntry
  devModeDeployNames: string[]
  localModeDeployNames: string[]
}

@Profile()
export class DeployTask extends BaseActionTask<DeployAction> {
  type: TaskType = "deploy"
  concurrencyLimit = 10

  forceBuild: boolean
  fromWatch: boolean
  devModeDeployNames: string[]
  localModeDeployNames: string[]

  constructor({
    garden,
    graph,
    log,
    action,
    force,
    forceBuild,
    fromWatch = false,
    devModeDeployNames,
    localModeDeployNames,
  }: DeployTaskParams) {
    super({ garden, log, force, action, graph })
    this.graph = graph
    this.forceBuild = forceBuild
    this.fromWatch = fromWatch
    this.devModeDeployNames = devModeDeployNames
    this.localModeDeployNames = localModeDeployNames
  }

  async resolveDependencies() {
    const dg = this.graph

    const deps = dg.getDependencies({
      kind: "deploy",
      name: this.getName(),
      recursive: false,
    })

    const statusTask = new GetServiceStatusTask({
      garden: this.garden,
      graph: this.graph,
      log: this.log,
      action: this.action,
      force: false,
      devModeDeployNames: this.devModeDeployNames,
      localModeDeployNames: this.localModeDeployNames,
    })

    return [statusTask, ...getDeployDeps(this, deps, false), ...getTaskDeps(this, deps, false)]
  }

  getDescription() {
    return `deploying ${this.action.longDescription()})`
  }

  async process(dependencyResults: GraphResults): Promise<ServiceStatus> {
    const version = this.version

    const devMode = includes(this.devModeDeployNames, this.action.name)
    const localMode = includes(this.localModeDeployNames, this.action.name)

    const dependencies = this.graph.getDependencies({
      kind: "deploy",
      name: this.getName(),
      recursive: false,
    })

    const serviceStatuses = getServiceStatuses(dependencyResults)
    const taskResults = getRunTaskResults(dependencyResults)

    // TODO: attach runtimeContext to GetServiceStatusTask output
    const runtimeContext = await prepareRuntimeContext({
      garden: this.garden,
      graph: this.graph,
      dependencies,
      version,
      moduleVersion: this.version,
      serviceStatuses,
      taskResults,
    })

    const actions = await this.garden.getActionRouter()

    let status = serviceStatuses[this.action.name]
    const devModeSkipRedeploy = status.devMode && devMode
    const localModeSkipRedeploy = status.localMode && localMode

    const log = this.log.info({
      status: "active",
      section: this.action.name,
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
        status = await actions.deploy.deploy({
          graph: this.graph,
          action: this.action,
          runtimeContext,
          log,
          force: this.force,
          devMode,
          localMode,
        })
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
        action: this.action,
        status,
      })

      for (const proxy of proxies) {
        const targetHost = proxy.spec.targetName || this.action.name

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
