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
import { PublishResult } from "../types/plugin/outputs"
import { BaseTask } from "../tasks/base"
import { Garden } from "../garden"
import { DependencyGraphNodeType } from "../dependency-graph"

export interface PublishTaskParams {
  garden: Garden
  module: Module
  forceBuild: boolean
}

export class PublishTask extends BaseTask {
  type = "publish"
  depType: DependencyGraphNodeType = "publish"

  private module: Module
  private forceBuild: boolean

  constructor({ garden, module, forceBuild }: PublishTaskParams) {
    super({ garden, version: module.version })
    this.module = module
    this.forceBuild = forceBuild
  }

  async getDependencies() {
    if (!this.module.allowPublish) {
      return []
    }
    return [new BuildTask({
      garden: this.garden,
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
      this.garden.log.info({
        section: this.module.name,
        msg: "Publishing disabled",
        status: "active",
      })
      return { published: false }
    }

    const logEntry = this.garden.log.info({
      section: this.module.name,
      msg: "Publishing",
      status: "active",
    })

    let result: PublishResult
    try {
      result = await this.garden.actions.publishModule({ module: this.module, logEntry })
    } catch (err) {
      logEntry.setError()
      throw err
    }

    if (result.published) {
      logEntry.setSuccess({ msg: chalk.green(result.message || `Ready`), append: true })
    } else {
      logEntry.setWarn({ msg: result.message, append: true })
    }

    return result
  }
}
