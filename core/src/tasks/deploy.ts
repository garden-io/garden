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
import { BaseTask, TaskType, getServiceStatuses, getRunTaskResults } from "./base"
import { GardenService, ServiceStatus, getLinkUrl } from "../types/service"
import { Garden } from "../garden"
import { BuildTask } from "./build"
import { ConfigGraph } from "../config-graph"
import { startPortProxies } from "../proxy"
import { GraphResults } from "../task-graph"
import { prepareRuntimeContext } from "../runtime-context"
import { GetServiceStatusTask } from "./get-service-status"
import { Profile } from "../util/profiling"
import { getServiceStatusDeps, getTaskResultDeps, getDeployDeps, getTaskDeps } from "./helpers"
import { ConfigurationError } from "../exceptions"

export interface DeployTaskParams {
  garden: Garden
  graph: ConfigGraph
  service: GardenService
  force: boolean
  forceBuild: boolean
  fromWatch?: boolean
  log: LogEntry
  skipRuntimeDependencies?: boolean
  devModeServiceNames: string[]
  hotReloadServiceNames: string[]
  localModeServiceNames: string[]
}

@Profile()
export class DeployTask extends BaseTask {
  type: TaskType = "deploy"
  concurrencyLimit = 10
  graph: ConfigGraph
  service: GardenService
  forceBuild: boolean
  fromWatch: boolean
  skipRuntimeDependencies: boolean
  devModeServiceNames: string[]
  hotReloadServiceNames: string[]
  localModeServiceNames: string[]

  constructor({
    garden,
    graph,
    log,
    service,
    force,
    forceBuild,
    fromWatch = false,
    skipRuntimeDependencies = false,
    devModeServiceNames,
    hotReloadServiceNames,
    localModeServiceNames,
  }: DeployTaskParams) {
    super({ garden, log, force, version: service.version })
    this.graph = graph
    this.service = service
    this.forceBuild = forceBuild
    this.fromWatch = fromWatch
    this.skipRuntimeDependencies = skipRuntimeDependencies
    this.devModeServiceNames = devModeServiceNames
    this.hotReloadServiceNames = hotReloadServiceNames
    this.localModeServiceNames = localModeServiceNames
    this.validate()
  }

  async resolveDependencies() {
    const dg = this.graph

    const skippedServiceDepNames = [...this.hotReloadServiceNames]

    // We filter out service dependencies on services configured for hot reloading (if any)
    const deps = dg.getDependencies({
      nodeType: "deploy",
      name: this.getName(),
      recursive: false,
      filter: (depNode) => !(depNode.type === "deploy" && includes(skippedServiceDepNames, depNode.name)),
    })

    const statusTask = new GetServiceStatusTask({
      garden: this.garden,
      graph: this.graph,
      log: this.log,
      service: this.service,
      force: false,
      devModeServiceNames: this.devModeServiceNames,
      hotReloadServiceNames: this.hotReloadServiceNames,
      localModeServiceNames: this.localModeServiceNames,
    })

    if (this.fromWatch && includes(skippedServiceDepNames, this.service.name)) {
      // Only need to get existing statuses and results when using hot-reloading
      return [statusTask, ...getServiceStatusDeps(this, deps), ...getTaskResultDeps(this, deps)]
    } else {
      const buildTasks = await this.getBuildTasks()
      if (this.skipRuntimeDependencies) {
        // Then we don't deploy any service dependencies or run any task dependencies, but only get existing
        // statuses and results.
        return [statusTask, ...buildTasks, ...getServiceStatusDeps(this, deps), ...getTaskResultDeps(this, deps)]
      } else {
        return [statusTask, ...buildTasks, ...getDeployDeps(this, deps, false), ...getTaskDeps(this, deps, false)]
      }
    }
  }

  private async getBuildTasks(): Promise<BaseTask[]> {
    return BuildTask.factory({
      garden: this.garden,
      graph: this.graph,
      log: this.log,
      module: this.service.module,
      force: this.forceBuild,
    })
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
    const hotReload = !devMode && includes(this.hotReloadServiceNames, this.service.name)
    const localMode = includes(this.localModeServiceNames, this.service.name)

    const dependencies = this.graph.getDependencies({
      nodeType: "deploy",
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
    const devModeSkipRedeploy = status.devMode && (devMode || hotReload)
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
        status = await actions.deployService({
          graph: this.graph,
          service: this.service,
          runtimeContext,
          log,
          force: this.force,
          devMode,
          hotReload,
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
