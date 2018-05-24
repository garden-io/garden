/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Bluebird from "bluebird"
import chalk from "chalk"
import { LogEntry } from "../logger"
import { PluginContext } from "../plugin-context"
import { BuildTask } from "./build"
import { Task, TaskParams, TaskVersion } from "../types/task"
import {
  Service,
  ServiceStatus,
} from "../types/service"
import { EntryStyle } from "../logger/types"

export interface DeployTaskParams extends TaskParams {
  ctx: PluginContext
  service: Service
  force: boolean
  forceBuild: boolean
  logEntry?: LogEntry
}

export class DeployTask extends Task {
  type = "deploy"

  private ctx: PluginContext
  private service: Service
  private force: boolean
  private forceBuild: boolean
  private logEntry?: LogEntry

  constructor(initArgs: DeployTaskParams & TaskVersion) {
    super(initArgs)
    this.ctx = initArgs.ctx
    this.service = initArgs.service
    this.force = initArgs.force
    this.forceBuild = initArgs.forceBuild
    this.logEntry = initArgs.logEntry
  }

  static async factory(initArgs: DeployTaskParams): Promise<DeployTask> {
    initArgs.version = await initArgs.service.module.getVersion()
    return new DeployTask(<DeployTaskParams & TaskVersion>initArgs)
  }

  async getDependencies() {
    const serviceDeps = this.service.config.dependencies
    const services = await this.ctx.getServices(serviceDeps)
    const deps: Task[] = await Bluebird.map(services, async (service) => {
      return DeployTask.factory({
        service,
        ctx: this.ctx,
        force: this.force,
        forceBuild: this.forceBuild,
      })
    })

    deps.push(await BuildTask.factory({ ctx: this.ctx, module: this.service.module, force: this.forceBuild }))
    return deps
  }

  protected getName() {
    return this.service.name
  }

  getDescription() {
    return `deploying service ${this.service.name} (from module ${this.service.module.name})`
  }

  async process(): Promise<ServiceStatus> {
    const logEntry = (this.logEntry || this.ctx.log).info({
      section: this.service.name,
      msg: "Checking status",
      entryStyle: EntryStyle.activity,
    })

    // TODO: get version from build task results
    const { versionString } = await this.service.module.getVersion()
    const status = await this.ctx.getServiceStatus({ serviceName: this.service.name, logEntry })

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

    logEntry.setState({ section: this.service.name, msg: "Deploying" })

    const result = await this.ctx.deployService({
      serviceName: this.service.name,
      runtimeContext: await this.service.prepareRuntimeContext(),
      logEntry,
    })

    logEntry.setSuccess({ msg: chalk.green(`Ready`), append: true })

    return result
  }
}
