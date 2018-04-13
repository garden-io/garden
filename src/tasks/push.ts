/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { Task } from "../task-graph"
import { PluginContext } from "../plugin-context"
import { BuildTask } from "./build"
import { Module } from "../types/module"
import { EntryStyle } from "../logger/types"
import { PushResult } from "../types/plugin"

export class PushTask<T extends Module<any>> extends Task {
  type = "push"

  constructor(
    private ctx: PluginContext,
    private module: T,
    private forceBuild: boolean) {
    super()
  }

  async getDependencies() {
    if (!(await this.module.getConfig()).allowPush) {
      return []
    }
    return [new BuildTask(this.ctx, this.module, this.forceBuild)]
  }

  getKey() {
    // TODO: Include version in the task key (may need to make this method async).
    return this.module.name
  }

  async process(): Promise<PushResult> {
    if (!(await this.module.getConfig()).allowPush) {
      this.ctx.log.info({
        section: this.module.name,
        msg: "Push disabled",
        entryStyle: EntryStyle.activity,
      })
      return { pushed: false }
    }

    const entry = this.ctx.log.info({
      section: this.module.name,
      msg: "Pushing",
      entryStyle: EntryStyle.activity,
    })

    const result = await this.ctx.pushModule(this.module, entry)

    if (result.pushed) {
      entry.setSuccess({ msg: chalk.green(result.message || `Ready`), append: true })
    } else {
      entry.setWarn({ msg: result.message, append: true })
    }

    return result
  }
}
