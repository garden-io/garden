/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { LogEntry } from "../logger/log-entry"
import { BaseTask } from "./base"
import { Service } from "../types/service"
import { Garden } from "../garden"
import { DependencyGraphNodeType } from "../dependency-graph"

interface Params {
  garden: Garden
  force: boolean
  service: Service
  log: LogEntry
}

export class HotReloadTask extends BaseTask {
  type = "hot-reload"
  depType: DependencyGraphNodeType = "service"

  private service: Service

  constructor(
    { garden, log, service, force }: Params,
  ) {
    super({ garden, log, force, version: service.module.version })
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

    try {
      await this.garden.actions.hotReloadService({ log, service: this.service })
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
