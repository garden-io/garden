/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { BuildTask } from "./build"
import { Module } from "../types/module"
import { PublishResult } from "../types/plugin/module/publishModule"
import { BaseTask, TaskType } from "../tasks/base"
import { Garden } from "../garden"
import { LogEntry } from "../logger/log-entry"

export interface PublishTaskParams {
  garden: Garden
  log: LogEntry
  module: Module
  forceBuild: boolean
}

export class PublishTask extends BaseTask {
  type: TaskType = "publish"

  private module: Module
  private forceBuild: boolean

  constructor({ garden, log, module, forceBuild }: PublishTaskParams) {
    super({ garden, log, version: module.version })
    this.module = module
    this.forceBuild = forceBuild
  }

  async getDependencies() {
    if (!this.module.allowPublish) {
      return []
    }
    return [new BuildTask({
      garden: this.garden,
      log: this.log,
      module: this.module,
      force: this.forceBuild,
    })]
  }

  getName() {
    return this.module.name
  }

  getDescription() {
    return `publishing module ${this.module.name}`
  }

  async process(): Promise<PublishResult> {
    if (!this.module.allowPublish) {
      this.log.info({
        section: this.module.name,
        msg: "Publishing disabled",
        status: "active",
      })
      return { published: false }
    }

    const log = this.log.info({
      section: this.module.name,
      msg: "Publishing",
      status: "active",
    })

    const actions = await this.garden.getActionRouter()

    let result: PublishResult
    try {
      result = await actions.publishModule({ module: this.module, log })
    } catch (err) {
      log.setError()
      throw err
    }

    if (result.published) {
      log.setSuccess({ msg: chalk.green(result.message || `Ready`), append: true })
    } else {
      log.setWarn({ msg: result.message, append: true })
    }

    return result
  }
}
