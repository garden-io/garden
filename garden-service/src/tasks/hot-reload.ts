/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { LogEntry } from "../logger/log-entry"
import { BaseTask, TaskType } from "./base"
import { Service, getServiceRuntimeContext } from "../types/service"
import { Garden } from "../garden"
import { DependencyGraphNodeType, ConfigGraph } from "../config-graph"

interface Params {
  garden: Garden
  graph: ConfigGraph
  force: boolean
  service: Service
  log: LogEntry
}

export class HotReloadTask extends BaseTask {
  type: TaskType = "hot-reload"
  depType: DependencyGraphNodeType = "service"

  private graph: ConfigGraph
  private service: Service

  constructor(
    { garden, graph, log, service, force }: Params,
  ) {
    super({ garden, log, force, version: service.module.version })
    this.graph = graph
    this.service = service
  }

  protected getName() {
    return this.service.name
  }

  getDescription() {
    return `hot-reloading service ${this.service.name}`
  }

  async process(): Promise<{}> {
    const log = this.log.info({
      section: this.service.name,
      msg: "Hot reloading...",
      status: "active",
    })

    const runtimeContext = await getServiceRuntimeContext(this.garden, this.graph, this.service)

    try {
      await this.garden.actions.hotReloadService({ log, service: this.service, runtimeContext })
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
