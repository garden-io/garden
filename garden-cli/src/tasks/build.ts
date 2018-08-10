/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Bluebird from "bluebird"
import chalk from "chalk"
import { PluginContext } from "../plugin-context"
import { Module } from "../types/module"
import { EntryStyle } from "../logger/types"
import { BuildResult } from "../types/plugin/outputs"
import { Task, TaskParams, TaskVersion } from "../types/task"

export interface BuildTaskParams extends TaskParams {
  ctx: PluginContext
  module: Module
  force: boolean
}

export class BuildTask extends Task {
  type = "build"

  private ctx: PluginContext
  private module: Module
  private force: boolean

  constructor(initArgs: BuildTaskParams & TaskVersion) {
    super(initArgs)
    this.ctx = initArgs.ctx
    this.module = initArgs.module
    this.force = initArgs.force
  }

  /*
    TODO: Replace with a generic factory method on the Task class to avoid repetition. This applies equally to other
     child classes of Task that implement an equivalent factory method.
  */
  static async factory(initArgs: BuildTaskParams): Promise<BuildTask> {
    initArgs.version = await initArgs.module.getVersion()
    return new BuildTask(<BuildTaskParams & TaskVersion>initArgs)
  }

  async getDependencies(): Promise<BuildTask[]> {
    const deps = await this.module.getBuildDependencies()
    return Bluebird.map(deps, async (m: Module) => {
      return BuildTask.factory({ ctx: this.ctx, module: m, force: this.force })
    })
  }

  protected getName() {
    return this.module.name
  }

  getDescription() {
    return `building ${this.module.name}`
  }

  async process(): Promise<BuildResult> {
    const moduleName = this.module.name

    if (!this.force && (await this.ctx.getModuleBuildStatus({ moduleName })).ready) {
      // this is necessary in case other modules depend on files from this one
      await this.ctx.stageBuild(moduleName)
      return { fresh: false }
    }

    const logEntry = this.ctx.log.info({
      section: this.module.name,
      msg: "Building",
      entryStyle: EntryStyle.activity,
    })

    const result = await this.ctx.buildModule({
      moduleName,
      logEntry,
    })
    logEntry.setSuccess({ msg: chalk.green(`Done (took ${logEntry.getDuration(1)} sec)`), append: true })

    return result
  }
}
