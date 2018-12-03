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
import { BaseTask } from "./base"
import {
  Service,
  ServiceStatus,
  prepareRuntimeContext,
} from "../types/service"
import { Garden } from "../garden"
import { PushTask } from "./push"
import { TaskTask } from "./task"
import { DependencyGraphNodeType } from "../dependency-graph"

export interface DeployTaskParams {
  garden: Garden
  service: Service
  force: boolean
  forceBuild: boolean
  fromWatch?: boolean
  log: LogEntry
  hotReloadServiceNames?: string[]
}

export class DeployTask extends BaseTask {
  type = "deploy"
  depType: DependencyGraphNodeType = "service"

  private service: Service
  private forceBuild: boolean
  private fromWatch: boolean
  private hotReloadServiceNames: string[]

  constructor(
    { garden, log, service, force, forceBuild, fromWatch = false, hotReloadServiceNames = [] }: DeployTaskParams,
  ) {
    super({ garden, log, force, version: service.module.version })
    this.service = service
    this.forceBuild = forceBuild
    this.fromWatch = fromWatch
    this.hotReloadServiceNames = hotReloadServiceNames
  }

  async getDependencies() {

    const dg = await this.garden.getDependencyGraph()

    // We filter out service dependencies on services configured for hot reloading (if any)
    const deps = await dg.getDependencies(this.depType, this.getName(), false,
      (depNode) => !(depNode.type === this.depType && includes(this.hotReloadServiceNames, depNode.name)))

    const deployTasks = await Bluebird.map(deps.service, async (service) => {
      return new DeployTask({
        garden: this.garden,
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
      const taskTasks = deps.task.map(task => {
        return new TaskTask({
          task,
          garden: this.garden,
          log: this.log,
          force: false,
          forceBuild: this.forceBuild,
        })
      })

      const pushTask = new PushTask({
        garden: this.garden,
        log: this.log,
        module: this.service.module,
        force: this.forceBuild,
        fromWatch: this.fromWatch,
        hotReloadServiceNames: this.hotReloadServiceNames,
      })

      return [...deployTasks, ...taskTasks, pushTask]
    }
  }

  protected getName() {
    return this.service.name
  }

  getDescription() {
    return `deploying service ${this.service.name} (from module ${this.service.module.name})`
  }

  async process(): Promise<ServiceStatus> {
    const log = this.log.info({
      section: this.service.name,
      msg: "Checking status",
      status: "active",
    })

    // TODO: get version from build task results
    const { versionString } = this.version
    const hotReloadEnabled = includes(this.hotReloadServiceNames, this.service.name)
    const status = await this.garden.actions.getServiceStatus({
      service: this.service,
      verifyHotReloadStatus: hotReloadEnabled ? "enabled" : "disabled",
      log,
    })

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
      return status
    }

    log.setState(`Deploying version ${versionString}...`)

    const dependencies = await this.garden.getServices(this.service.config.dependencies)

    let result: ServiceStatus
    try {
      result = await this.garden.actions.deployService({
        service: this.service,
        runtimeContext: await prepareRuntimeContext(this.garden, log, this.service.module, dependencies),
        log,
        force: this.force,
        hotReload: hotReloadEnabled,
      })
    } catch (err) {
      log.setError()
      throw err
    }

    log.setSuccess({ msg: chalk.green(`Ready`), append: true })
    return result
  }
}
