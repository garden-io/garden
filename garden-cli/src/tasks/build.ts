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
import { Task, TaskParams } from "../tasks/base"

export interface BuildTaskParams {
  ctx: PluginContext
  module: Module
  force: boolean
}

export class BuildTask extends Task {
  type = "build"

  private ctx: PluginContext
  private module: Module
  private force: boolean

  constructor({ ctx, module, force }: BuildTaskParams) {
    super({ version: module.version })
    this.ctx = ctx
    this.module = module
    this.force = force
  }

  async getDependencies(): Promise<BuildTask[]> {
    const deps = await this.ctx.resolveModuleDependencies(this.module.build.dependencies, [])
    return Bluebird.map(deps, async (m: Module) => {
      return new BuildTask({ ctx: this.ctx, module: m, force: this.force })
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
