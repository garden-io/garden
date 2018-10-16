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
import { Task } from "./base"
import {
  Service,
  ServiceStatus,
  prepareRuntimeContext,
} from "../types/service"
import { Garden } from "../garden"
import { PushTask } from "./push"

export interface DeployTaskParams {
  garden: Garden
  service: Service
  force: boolean
  forceBuild: boolean
  logEntry?: LogEntry
  //TODO: Move watch and hotReloadServiceNames to a new commandContext object?
  watch?: boolean
  hotReloadServiceNames?: string[]
}

export class DeployTask extends Task {
  type = "deploy"

  private service: Service
  private forceBuild: boolean
  private logEntry?: LogEntry
  private watch: boolean
  private hotReloadServiceNames?: string[]

  constructor({ garden, service, force, forceBuild, logEntry, watch, hotReloadServiceNames }: DeployTaskParams) {
    super({ garden, force, version: service.module.version })
    this.service = service
    this.forceBuild = forceBuild
    this.logEntry = logEntry
    this.watch = !!watch
    this.hotReloadServiceNames = hotReloadServiceNames
  }

  async getDependencies() {
    const servicesToDeploy = (await this.garden.getServices(this.service.config.dependencies))
      .filter(s => !includes(this.hotReloadServiceNames, s.name))

    const deps: Task[] = await Bluebird.map(servicesToDeploy, async (service) => {
      return new DeployTask({
        garden: this.garden,
        service,
        force: false,
        forceBuild: this.forceBuild,
        watch: this.watch,
        hotReloadServiceNames: this.hotReloadServiceNames,
      })
    })

    deps.push(new PushTask({
      garden: this.garden,
      module: this.service.module,
      forceBuild: this.forceBuild,
    }))

    return deps
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
