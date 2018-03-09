/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { round } from "lodash"
import { PluginContext } from "../plugin-context"
import { Module } from "../types/module"
import { EntryStyle } from "../logger/types"
import { BuildResult } from "../types/plugin"
import { Task } from "../types/task"

export class BuildTask<T extends Module> extends Task {
  type = "build"

  constructor(private ctx: PluginContext, private module: T, private force: boolean) {
    super()
  }

  async getDependencies() {
    const deps = await this.module.getBuildDependencies()
    return deps.map(<M extends Module>(m: M) => new BuildTask(this.ctx, m, this.force))
  }

  protected getName() {
    return this.module.name
  }

  async process(): Promise<BuildResult> {
    if (!this.force && (await this.ctx.getModuleBuildStatus(this.module)).ready) {
      // this is necessary in case other modules depend on files from this one
      await this.ctx.stageBuild(this.module)
      return { fresh: false }
    }

    const entry = this.ctx.log.info({
      section: this.module.name,
      msg: "Building",
      entryStyle: EntryStyle.activity,
    })

    const startTime = new Date().getTime()
    const result = await this.ctx.buildModule(this.module, {}, entry)
    const buildTime = (new Date().getTime()) - startTime

    entry.setSuccess({ msg: chalk.green(`Done (took ${round(buildTime / 1000, 1)} sec)`), append: true })

    return result
  }
}
