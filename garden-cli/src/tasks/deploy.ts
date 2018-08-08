/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Bluebird from "bluebird"
import chalk from "chalk"
import { LogEntry } from "../logger/logger"
import { PluginContext } from "../plugin-context"
import { BuildTask } from "./build"
import { Task } from "../tasks/base"
import {
  Service,
  ServiceStatus,
  prepareRuntimeContext,
} from "../types/service"
import { EntryStyle } from "../logger/types"

export interface DeployTaskParams {
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

  constructor({ ctx, service, force, forceBuild, logEntry }: DeployTaskParams) {
    super({ version: service.module.version })
    this.ctx = ctx
    this.service = service
    this.force = force
    this.forceBuild = forceBuild
    this.logEntry = logEntry
  }

  async getDependencies() {
    const serviceDeps = this.service.config.dependencies
    const services = await this.ctx.getServices(serviceDeps)

    const deps: Task[] = await Bluebird.map(services, async (service) => {
      return new DeployTask({
        service,
        ctx: this.ctx,
        force: this.force,
        forceBuild: this.forceBuild,
      })
    })

    deps.push(new BuildTask({
      ctx: this.ctx,
      module: this.service.module,
      force: this.forceBuild,
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
    const logEntry = (this.logEntry || this.ctx.log).info({
      section: this.service.name,
      msg: "Checking status",
      entryStyle: EntryStyle.activity,
    })

    // TODO: get version from build task results
    const { versionString } = await this.service.module.version
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

    const dependencies = await this.ctx.getServices(this.service.config.dependencies)

    const result = await this.ctx.deployService({
      serviceName: this.service.name,
      runtimeContext: await prepareRuntimeContext(this.ctx, this.service.module, dependencies),
      logEntry,
      force: this.force,
    })

    logEntry.setSuccess({ msg: chalk.green(`Ready`), append: true })

    return result
  }
}
