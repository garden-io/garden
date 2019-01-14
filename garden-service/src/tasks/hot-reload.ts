/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { uniq, flatten } from "lodash"
import { LogEntry } from "../logger/log-entry"
import { BaseTask } from "./base"
import { prepareRuntimeContext } from "../types/service"
import { Garden } from "../garden"
import { DependencyGraphNodeType } from "../dependency-graph"
import { Module } from "../types/module"

export interface DeployTaskParams {
  garden: Garden
  force: boolean
  module: Module
  log: LogEntry
}

export class HotReloadTask extends BaseTask {
  type = "hot-reload"
  depType: DependencyGraphNodeType = "service"

  private module: Module

  constructor(
    { garden, log, module, force }: DeployTaskParams,
  ) {
    super({ garden, log, force, version: module.version })
    this.module = module
  }

  protected getName() {
    return this.module.name
  }

  getDescription() {
    return `hot-reloading module ${this.module.name}`
  }

  async process(): Promise<{}> {
    const module = this.module
    const log = this.log.info({
      section: module.name,
      msg: "Hot reloading...",
      status: "active",
    })

    const serviceDependencyNames = uniq(flatten(module.services.map(s => s.config.dependencies)))
    const runtimeContext = await prepareRuntimeContext(
      this.garden, log, module, await this.garden.getServices(serviceDependencyNames),
    )

    try {
      await this.garden.actions.hotReload({ log, module, runtimeContext })
    } catch (err) {
      log.setError()
      throw err
    }

    const msec = log.getDuration(5) * 1000
    log.setSuccess({
      msg: chalk.green(`Done (took ${msec} ms)`),
      append: true,
    })

    return {}
  }
}
