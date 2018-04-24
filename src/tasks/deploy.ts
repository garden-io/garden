/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { LogEntry } from "../logger"
import { PluginContext } from "../plugin-context"
import { BuildTask } from "./build"
import { values } from "lodash"
import { Task } from "../types/task"
import {
  Service,
  ServiceStatus,
} from "../types/service"
import { EntryStyle } from "../logger/types"
import chalk from "chalk"

export class DeployTask<T extends Service<any>> extends Task {
  type = "deploy"

  constructor(
    private ctx: PluginContext,
    private service: T,
    private force: boolean,
    private forceBuild: boolean,
    private logEntry?: LogEntry) {
    super()
  }

  async getDependencies() {
    const serviceDeps = this.service.config.dependencies
    const services = await this.ctx.getServices(serviceDeps)
    const deps: Task[] = values(services).map((s) => {
      return new DeployTask(this.ctx, s, this.force, this.forceBuild)
    })

    deps.push(new BuildTask(this.ctx, this.service.module, this.forceBuild))
    return deps
  }

  protected getName() {
    return this.service.name
  }

  getDescription() {
    return `deploying service ${this.service.name} (from module ${this.service.module.name})`
  }

  async process(): Promise<ServiceStatus> {
    const entry = (this.logEntry || this.ctx.log).info({
      section: this.service.name,
      msg: "Checking status",
      entryStyle: EntryStyle.activity,
    })

    // we resolve the config again because context may have changed after dependencies are deployed
    const dependencies = await this.service.getDependencies()
    const runtimeContext = await this.service.module.prepareRuntimeContext(dependencies)
    const service = await this.service.resolveConfig(runtimeContext)

    // TODO: get version from build task results
    const { versionString } = await this.service.module.getVersion()
    const status = await this.ctx.getServiceStatus(service)

    if (
      !this.force &&
      versionString === status.version &&
      status.state === "ready"
    ) {
      // already deployed and ready
      entry.setSuccess({
        msg: `Version ${versionString} already deployed`,
        append: true,
      })
      return status
    }

    entry.setState({ section: this.service.name, msg: "Deploying" })

    const result = await this.ctx.deployService(service, runtimeContext, entry)

    entry.setSuccess({ msg: chalk.green(`Ready`), append: true })

    return result
  }
}
