/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import chalk from "chalk"
import { includes } from "lodash"
import { LogEntry } from "../logger/log-entry"
import { BaseTask, TaskType, getServiceStatuses, getRunTaskResults } from "./base"
import { GardenService, ServiceStatus, getLinkUrl } from "../types/service"
import { Garden } from "../garden"
import { TaskTask } from "./task"
import { BuildTask } from "./build"
import { ConfigGraph } from "../config-graph"
import { startPortProxies } from "../proxy"
import { GraphResults } from "../task-graph"
import { prepareRuntimeContext } from "../runtime-context"
import { GetServiceStatusTask } from "./get-service-status"
import { GetTaskResultTask } from "./get-task-result"
import { Profile } from "../util/profiling"

export interface DeployTaskParams {
  garden: Garden
  graph: ConfigGraph
  service: GardenService
  force: boolean
  forceBuild: boolean
  fromWatch?: boolean
  log: LogEntry
  devModeServiceNames: string[]
  hotReloadServiceNames: string[]
}

@Profile()
export class DeployTask extends BaseTask {
  type: TaskType = "deploy"
  concurrencyLimit = 10

  private graph: ConfigGraph
  private service: GardenService
  private forceBuild: boolean
  private fromWatch: boolean
  private devModeServiceNames: string[]
  private hotReloadServiceNames: string[]

  constructor({
    garden,
    graph,
    log,
    service,
    force,
    forceBuild,
    fromWatch = false,
    devModeServiceNames,
    hotReloadServiceNames,
  }: DeployTaskParams) {
    super({ garden, log, force, version: service.version })
    this.graph = graph
    this.service = service
    this.forceBuild = forceBuild
    this.fromWatch = fromWatch
    this.devModeServiceNames = devModeServiceNames
    this.hotReloadServiceNames = hotReloadServiceNames
  }

  async resolveDependencies() {
    const dg = this.graph

    const skipServiceDeps = [...this.hotReloadServiceNames]

    // We filter out service dependencies on services configured for hot reloading or dev mode (if any)
    const deps = dg.getDependencies({
      nodeType: "deploy",
      name: this.getName(),
      recursive: false,
      filter: (depNode) => !(depNode.type === "deploy" && includes(skipServiceDeps, depNode.name)),
    })

    const statusTask = new GetServiceStatusTask({
      garden: this.garden,
      graph: this.graph,
      log: this.log,
      service: this.service,
      force: false,
      devModeServiceNames: this.devModeServiceNames,
      hotReloadServiceNames: this.hotReloadServiceNames,
    })

    if (this.fromWatch && includes(skipServiceDeps, this.service.name)) {
      // Only need to get existing statuses and results when hot-reloading
      const dependencyStatusTasks = deps.deploy.map((service) => {
        return new GetServiceStatusTask({
          garden: this.garden,
          graph: this.graph,
          log: this.log,
          service,
          force: false,
          devModeServiceNames: this.devModeServiceNames,
          hotReloadServiceNames: this.hotReloadServiceNames,
        })
      })

      const taskResultTasks = await Bluebird.map(deps.run, async (task) => {
        return new GetTaskResultTask({
          garden: this.garden,
          log: this.log,
          task,
          force: false,
        })
      })

      return [statusTask, ...dependencyStatusTasks, ...taskResultTasks]
    } else {
      const deployTasks = deps.deploy.map((service) => {
        return new DeployTask({
          garden: this.garden,
          graph: this.graph,
          log: this.log,
          service,
          force: false,
          forceBuild: this.forceBuild,
          fromWatch: this.fromWatch,
          devModeServiceNames: this.devModeServiceNames,
          hotReloadServiceNames: this.hotReloadServiceNames,
        })
      })

      const taskTasks = await Bluebird.map(deps.run, (task) => {
        return new TaskTask({
          task,
          garden: this.garden,
          log: this.log,
          graph: this.graph,
          force: false,
          forceBuild: this.forceBuild,
          devModeServiceNames: this.devModeServiceNames,
          hotReloadServiceNames: this.hotReloadServiceNames,
        })
      })

      const buildTasks = await BuildTask.factory({
        garden: this.garden,
        graph: this.graph,
        log: this.log,
        module: this.service.module,
        force: this.forceBuild,
      })

      return [statusTask, ...deployTasks, ...taskTasks, ...buildTasks]
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
    const hotReload = !devMode && includes(this.hotReloadServiceNames, this.service.name)

    const dependencies = this.graph.getDependencies({
      nodeType: "deploy",
      name: this.getName(),
      recursive: false,
    })

    const serviceStatuses = getServiceStatuses(dependencyResults)
    const taskResults = getRunTaskResults(dependencyResults)

    // TODO: attach runtimeContext to GetServiceTask output
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

    const log = this.log.info({
      status: "active",
      section: this.service.name,
      msg: `Deploying version ${version}...`,
    })

    if (!this.force && version === status.version && status.state === "ready") {
      // already deployed and ready
      log.setSuccess({
        msg: chalk.green("Already deployed"),
        append: true,
      })
    } else {
      try {
        status = await actions.deployService({
          service: this.service,
          runtimeContext,
          log,
          force: this.force,
          devMode,
          hotReload,
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
      const proxies = await startPortProxies(this.garden, log, this.service, status)

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
