/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import chalk from "chalk"
import pluralize = require("pluralize")
import { Module, getModuleKey } from "../types/module"
import { BuildResult } from "../types/plugin/module/build"
import { BaseTask, TaskType } from "../tasks/base"
import { Garden } from "../garden"
import { LogEntry } from "../logger/log-entry"

export interface BuildTaskParams {
  garden: Garden
  log: LogEntry
  module: Module
  force: boolean
  fromWatch?: boolean
  hotReloadServiceNames?: string[]
}

export class BuildTask extends BaseTask {
  type: TaskType = "build"

  private module: Module
  private fromWatch: boolean
  private hotReloadServiceNames: string[]

  constructor({ garden, log, module, force, fromWatch = false, hotReloadServiceNames = [] }: BuildTaskParams) {
    super({ garden, log, force, version: module.version })
    this.module = module
    this.fromWatch = fromWatch
    this.hotReloadServiceNames = hotReloadServiceNames
  }

  async getDependencies() {
    const dg = await this.garden.getConfigGraph()
    const deps = (await dg.getDependencies("build", this.getName(), false)).build

    return Bluebird.map(deps, async (m: Module) => {
      return new BuildTask({
        garden: this.garden,
        log: this.log,
        module: m,
        force: this.force,
        fromWatch: this.fromWatch,
        hotReloadServiceNames: this.hotReloadServiceNames,
      })
    })
  }

  getName() {
    return getModuleKey(this.module.name, this.module.plugin)
  }

  getDescription() {
    return `building ${this.getName()}`
  }

  async process(): Promise<BuildResult> {
    const module = this.module
    const actions = await this.garden.getActionRouter()

    const log = this.log.info({
      section: this.getName(),
      msg: `Preparing build (${pluralize("file", module.version.files.length, true)})...`,
      status: "active",
    })

    const logSuccess = () => {
      log.setSuccess({ msg: chalk.green(`Done (took ${log.getDuration(1)} sec)`), append: true })
    }

    await this.garden.buildDir.syncFromSrc(this.module, log)
    await this.garden.buildDir.syncDependencyProducts(this.module, log)

    if (!this.force) {
      log.setState({ msg: `Getting build status for ${module.version.versionString}...` })
      const status = await actions.getBuildStatus({ log: this.log, module })

      if (status.ready) {
        logSuccess()
        return { fresh: false }
      }
    }

    log.setState({ msg: `Building version ${module.version.versionString}...` })

    let result: BuildResult
    try {
      result = await actions.build({
        module,
        log,
      })
    } catch (err) {
      log.setError()
      throw err
    }

    logSuccess()
    return result
  }
}
