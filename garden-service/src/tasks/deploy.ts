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
// import { BuildTask } from "./build"

export interface DeployTaskParams {
  garden: Garden
  service: Service
  force: boolean
  forceBuild: boolean
  logEntry?: LogEntry
  fromWatch?: boolean
  hotReloadServiceNames?: string[]
}

export class DeployTask extends BaseTask {
  type = "deploy"
  depType: DependencyGraphNodeType = "service"

  private service: Service
  private forceBuild: boolean
  private logEntry?: LogEntry
  private fromWatch: boolean
  private hotReloadServiceNames: string[]

  constructor(
    { garden, service, force, forceBuild, logEntry, fromWatch = false, hotReloadServiceNames = [] }: DeployTaskParams,
  ) {
    super({ garden, force, version: service.module.version })
    this.service = service
    this.forceBuild = forceBuild
    this.logEntry = logEntry
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
          force: false,
          forceBuild: this.forceBuild,
        })
      })

      // const buildTask = new BuildTask({
      //   garden: this.garden, module: this.service.module, force: true
      // })

      const pushTask = new PushTask({
        garden: this.garden,
        module: this.service.module,
        force: this.forceBuild,
        fromWatch: this.fromWatch,
        hotReloadServiceNames: this.hotReloadServiceNames,
      })

      // return [ ...deployTasks, ...taskTasks, buildTask]
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
    const logEntry = (this.logEntry || this.garden.log).info({
      section: this.service.name,
      msg: "Checking status",
      status: "active",
    })

    // TODO: get version from build task results
    const { versionString } = await this.service.module.version
    const hotReloadEnabled = includes(this.hotReloadServiceNames, this.service.name)
    const status = await this.garden.actions.getServiceStatus({
      service: this.service,
      verifyHotReloadStatus: hotReloadEnabled ? "enabled" : "disabled",
      logEntry,
    })

    if (
      !this.force &&
      versionString === status.version &&
      status.state === "ready"
    ) {
      // already deployed and ready
      logEntry.setSuccess({
        msg: `Version ${versionString} already deployed`,
        append: true,
      })
      return status
    }

    logEntry.setState("Deploying")

    const dependencies = await this.garden.getServices(this.service.config.dependencies)

    let result: ServiceStatus
    try {
      result = await this.garden.actions.deployService({
        service: this.service,
        runtimeContext: await prepareRuntimeContext(this.garden, this.service.module, dependencies),
        logEntry,
        force: this.force,
        hotReload: hotReloadEnabled,
      })
    } catch (err) {
      logEntry.setError()
      throw err
    }

    logEntry.setSuccess({ msg: chalk.green(`Ready`), append: true })
    return result
  }
}
