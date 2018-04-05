/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Task } from "../task-graph"
import { Module } from "../types/module"
import { GardenContext } from "../context"
import { EntryStyle } from "../logger/types"
import chalk from "chalk"
import { round } from "lodash"
import { BuildResult } from "../types/plugin"

export class BuildTask<T extends Module> extends Task {
  type = "build"

  constructor(private ctx: GardenContext, private module: T, private force: boolean) {
    super()
  }

  async getDependencies() {
    const deps = await this.module.getBuildDependencies()
    return deps.map(<M extends Module>(m: M) => new BuildTask(this.ctx, m, this.force))
  }

  getKey() {
    // TODO: Include version in the task key (may need to make this method async).
    return this.module.name
  }

  async process(): Promise<BuildResult> {
    const entry = this.ctx.log.info({
      section: this.module.name,
      msg: "Building",
      entryStyle: EntryStyle.activity,
    })

    if (this.force || !(await this.module.getBuildStatus()).ready) {
      const startTime = new Date().getTime()
      const result = await this.ctx.buildModule(this.module, entry)
      const buildTime = (new Date().getTime()) - startTime

      entry.setSuccess({ msg: chalk.green(`Done (took ${round(buildTime / 1000, 1)} sec)`), append: true })

      return result
    } else {
      entry.setSuccess({ msg: "Already built" })
      return { fresh: false }
    }
  }
}
