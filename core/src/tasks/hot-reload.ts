/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { LogEntry } from "../logger/log-entry"
import { BaseTask, TaskType } from "./base"
import { GardenService } from "../types/service"
import { Garden } from "../garden"
import { ConfigGraph } from "../config-graph"
import { Profile } from "../util/profiling"

interface Params {
  force: boolean
  garden: Garden
  graph: ConfigGraph
  hotReloadServiceNames: string[]
  log: LogEntry
  service: GardenService
}

@Profile()
export class HotReloadTask extends BaseTask {
  type: TaskType = "hot-reload"
  concurrencyLimit = 10

  graph: ConfigGraph
  // hotReloadServiceNames: string[]
  service: GardenService

  constructor(params: Params) {
    super({ ...params, version: params.service.version })
    this.graph = params.graph
    // this.hotReloadServiceNames = hotReloadServiceNames || []
    this.service = params.service
  }

  async resolveDependencies() {
    return []
  }

  getName() {
    return this.service.name
  }

  getDescription() {
    return `hot-reloading service ${this.service.name}`
  }

  // TODO: we will need to uncomment this once the TaskGraph is processing concurrently, but this is safe to
  //       omit in the meantime because dev/deploy commands are guaranteed to complete deployments before running
  //       hot reload tasks.

  // async getDependencies() {
  //   // Ensure service has been deployed before attempting to hot-reload.
  //   // This task should be cached and return immediately in most cases.
  //   return [new DeployTask({
  //     fromWatch: true,
  //     force: false,
  //     forceBuild: false,
  //     garden: this.garden,
  //     graph: this.graph,
  //     hotReloadServiceNames: this.hotReloadServiceNames,
  //     log: this.log,
  //     service: this.service,
  //   })]
  // }

  async process(): Promise<{}> {
    const log = this.log.info({
      section: this.service.name,
      msg: "Hot reloading...",
      status: "active",
    })

    const actions = await this.garden.getActionRouter()

    try {
      await actions.hotReloadService({ log, graph: this.graph, service: this.service })
    } catch (err) {
      log.setError()
      throw err
    }

    log.setSuccess({
      msg: chalk.green(`Done (took ${log.getDuration(1)} sec)`),
      append: true,
    })

    return {}
  }
}
