/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { PluginContext } from "../plugin-context"
import { BuildTask } from "./build"
import { Module } from "../types/module"
import { EntryStyle } from "../logger/types"
import { PushResult } from "../types/plugin/outputs"
import { Task, TaskParams } from "../tasks/base"

export interface PushTaskParams{
  ctx: PluginContext
  module: Module
  forceBuild: boolean
}

export class PushTask extends Task {
  type = "push"

  private ctx: PluginContext
  private module: Module
  private forceBuild: boolean

  constructor({ ctx, module, forceBuild }: PushTaskParams) {
    super({ version: module.version })
    this.ctx = ctx
    this.module = module
    this.forceBuild = forceBuild
  }

  async getDependencies() {
    if (!this.module.allowPush) {
      return []
    }
    return [await new BuildTask({
      ctx: this.ctx,
      module: this.module,
      force: this.forceBuild,
    })]
  }

  getName() {
    // TODO: Include version in the task key (may need to make this method async).
    return this.module.name
  }

  getDescription() {
    return `pushing module ${this.module.name}`
  }

  async process(): Promise<PushResult> {
    if (!this.module.allowPush) {
      this.ctx.log.info({
        section: this.module.name,
        msg: "Push disabled",
        entryStyle: EntryStyle.activity,
      })
      return { pushed: false }
    }

    const logEntry = this.ctx.log.info({
      section: this.module.name,
      msg: "Pushing",
      entryStyle: EntryStyle.activity,
    })

    const result = await this.ctx.pushModule({ moduleName: this.module.name, logEntry })

    if (result.pushed) {
      logEntry.setSuccess({ msg: chalk.green(result.message || `Ready`), append: true })
    } else {
      logEntry.setWarn({ msg: result.message, append: true })
    }

    return result
  }
}
