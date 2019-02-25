/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Bluebird from "bluebird"
import chalk from "chalk"
import { includes } from "lodash"
import { LogEntry } from "../logger/log-entry"
import { BaseTask, TaskType } from "./base"
import { Service, ServiceStatus, getServiceRuntimeContext, getIngressUrl } from "../types/service"
import { Garden } from "../garden"
import { TaskTask } from "./task"
import { BuildTask } from "./build"
import { ConfigGraph } from "../config-graph"

export interface DeployTaskParams {
  garden: Garden
  graph: ConfigGraph
  service: Service
  force: boolean
  forceBuild: boolean
  fromWatch?: boolean
  log: LogEntry
  hotReloadServiceNames?: string[]
}

export class DeployTask extends BaseTask {
  type: TaskType = "deploy"

  private graph: ConfigGraph
  private service: Service
  private forceBuild: boolean
  private fromWatch: boolean
  private hotReloadServiceNames: string[]

  constructor(
    { garden, graph, log, service, force, forceBuild, fromWatch = false, hotReloadServiceNames = [] }: DeployTaskParams,
  ) {
    super({ garden, log, force, version: service.module.version })
    this.graph = graph
    this.service = service
    this.forceBuild = forceBuild
    this.fromWatch = fromWatch
    this.hotReloadServiceNames = hotReloadServiceNames
  }

  async getDependencies() {
    const dg = this.graph

    // We filter out service dependencies on services configured for hot reloading (if any)
    const deps = await dg.getDependencies("service", this.getName(), false,
      (depNode) => !(depNode.type === "service" && includes(this.hotReloadServiceNames, depNode.name)))

    const deployTasks = await Bluebird.map(deps.service, async (service) => {
      return new DeployTask({
        garden: this.garden,
        graph: this.graph,
        log: this.log,
        service,
        force: false,
        forceBuild: this.forceBuild,
        fromWatch: this.fromWatch,
        hotReloadServiceNames: this.hotReloadServiceNames,
      })
    })

    if (this.fromWatch && includes(this.hotReloadServiceNames, this.service.name)) {
      return deployTasks
    } else {
      const taskTasks = await Bluebird.map(deps.task, (task) => {
        return TaskTask.factory({
          task,
          garden: this.garden,
          log: this.log,
          graph: this.graph,
          force: this.force,
          forceBuild: this.forceBuild,
        })
      })

      const buildTask = new BuildTask({
        garden: this.garden,
        log: this.log,
        module: this.service.module,
        force: this.forceBuild,
        fromWatch: this.fromWatch,
        hotReloadServiceNames: this.hotReloadServiceNames,
      })

      return [...deployTasks, ...taskTasks, buildTask]
    }
  }

  getName() {
    return this.service.name
  }

  getDescription() {
    return `deploying service ${this.service.name} (from module ${this.service.module.name})`
  }

  async process(): Promise<ServiceStatus> {
    const log = this.log.info({
      section: this.service.name,
      msg: "Checking status...",
      status: "active",
    })

    // TODO: get version from build task results
    let version = this.version
    const hotReload = includes(this.hotReloadServiceNames, this.service.name)

    const runtimeContext = await getServiceRuntimeContext(this.garden, this.graph, this.service)
    const actions = await this.garden.getActionHelper()

    let status = await actions.getServiceStatus({
      service: this.service,
      log,
      hotReload,
      runtimeContext,
    })

    const { versionString } = version

    if (
      !this.force &&
      versionString === status.version &&
      status.state === "ready"
    ) {
      // already deployed and ready
      log.setSuccess({
        msg: `Version ${versionString} already deployed`,
        append: true,
      })
    } else {
      log.setState(`Deploying version ${versionString}...`)

      try {
        status = await actions.deployService({
          service: this.service,
          runtimeContext,
          log,
          force: this.force,
          hotReload,
        })
      } catch (err) {
        log.setError()
        throw err
      }

      log.setSuccess({ msg: chalk.green(`Done (took ${log.getDuration(1)} sec)`), append: true })
    }

    for (const ingress of status.ingresses || []) {
      log.info(chalk.gray("→ Ingress: ") + chalk.underline.gray(getIngressUrl(ingress)))
    }

    return status
  }
}
