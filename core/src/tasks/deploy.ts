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
import { BaseTask, TaskType, getServiceStatuses, getRunTaskResults, BaseActionTask, BaseActionTaskParams } from "./base"
import { GardenService, ServiceStatus, getLinkUrl } from "../types/service"
import { BuildTask } from "./build"
import { ConfigGraph } from "../graph/config-graph"
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
  fromWatch?: boolean
  log: LogEntry
  skipRuntimeDependencies?: boolean
  devModeServiceNames: string[]
  localModeServiceNames: string[]
}

@Profile()
export class DeployTask extends BaseActionTask<DeployAction> {
  type: TaskType = "deploy"
  concurrencyLimit = 10
  graph: ConfigGraph
  service: GardenService
  forceBuild: boolean
  fromWatch: boolean
  skipRuntimeDependencies: boolean
  devModeServiceNames: string[]
  localModeServiceNames: string[]

  constructor({
    garden,
    graph,
    log,
    action,
    force,
    forceBuild,
    fromWatch = false,
    skipRuntimeDependencies = false,
    devModeServiceNames,
    localModeServiceNames,
  }: DeployTaskParams) {
    super({ garden, log, force, action, graph })
    this.graph = graph
    this.forceBuild = forceBuild
    this.fromWatch = fromWatch
    this.skipRuntimeDependencies = skipRuntimeDependencies
    this.devModeServiceNames = devModeServiceNames
    this.localModeServiceNames = localModeServiceNames
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
      service: this.service,
      force: false,
      devModeServiceNames: this.devModeServiceNames,
      localModeServiceNames: this.localModeServiceNames,
    })

    if (this.skipRuntimeDependencies) {
      // Then we don't deploy any service dependencies or run any task dependencies, but only get existing
      // statuses and results.
      return [statusTask, ...buildTasks, ...getServiceStatusDeps(this, deps), ...getTaskResultDeps(this, deps)]
    } else {
      return [statusTask, ...buildTasks, ...getDeployDeps(this, deps, false), ...getTaskDeps(this, deps, false)]
    }
  }

  getName() {
    return this.service.name
  }

  getDescription() {
    return `deploying service '${this.service.name}' (from module '${this.service.module.name}')`
  }

  async process(dependencyResults: GraphResults): Promise<ServiceStatus> {
    const version = this.version

    const devMode = includes(this.devModeServiceNames, this.service.name)
    const localMode = includes(this.localModeServiceNames, this.service.name)

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
      moduleVersion: this.service.module.version.versionString,
      serviceStatuses,
      taskResults,
    })

    const actions = await this.garden.getActionRouter()

    let status = serviceStatuses[this.service.name]
    const devModeSkipRedeploy = status.devMode && devMode
    const localModeSkipRedeploy = status.localMode && localMode

    const log = this.log.info({
      status: "active",
      section: this.service.name,
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
        service: this.service,
        status,
      })

      for (const proxy of proxies) {
        const targetHost = proxy.spec.targetName || this.service.name

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
