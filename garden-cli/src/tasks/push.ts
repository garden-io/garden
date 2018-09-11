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
import { EntryStyle } from "../logger/types"
import { PushResult } from "../types/plugin/outputs"
import { Task } from "../tasks/base"
import { Garden } from "../garden"

export interface PushTaskParams {
  garden: Garden
  module: Module
  forceBuild: boolean
}

export class PushTask extends Task {
  type = "push"

  private module: Module
  private forceBuild: boolean

  constructor({ garden, module, forceBuild }: PushTaskParams) {
    super({ garden, version: module.version })
    this.module = module
    this.forceBuild = forceBuild
  }

  async getDependencies() {
    if (!this.module.allowPush) {
      return []
    }
    return [new BuildTask({
      garden: this.garden,
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
      this.garden.log.info({
        section: this.module.name,
        msg: "Push disabled",
        entryStyle: EntryStyle.activity,
      })
      return { pushed: false }
    }

    const logEntry = this.garden.log.info({
      section: this.module.name,
      msg: "Pushing",
      entryStyle: EntryStyle.activity,
    })

    let result: PushResult
    try {
      result = await this.garden.actions.pushModule({ module: this.module, logEntry })
    } catch (err) {
      logEntry.setError()
      throw err
    }

    if (result.pushed) {
      logEntry.setSuccess({ msg: chalk.green(result.message || `Ready`), append: true })
    } else {
      logEntry.setWarn({ msg: result.message, append: true })
    }

    return result
  }
}
