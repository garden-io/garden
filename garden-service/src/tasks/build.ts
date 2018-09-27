/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Bluebird from "bluebird"
import chalk from "chalk"
import { Module } from "../types/module"
import { BuildResult } from "../types/plugin/outputs"
import { Task } from "../tasks/base"
import { Garden } from "../garden"

export interface BuildTaskParams {
  garden: Garden
  module: Module
  force: boolean
}

export class BuildTask extends Task {
  type = "build"

  private module: Module

  constructor({ garden, force, module }: BuildTaskParams) {
    super({ garden, force, version: module.version })
    this.module = module
  }

  async getDependencies(): Promise<BuildTask[]> {
    const deps = await this.garden.resolveModuleDependencies(this.module.build.dependencies, [])
    return Bluebird.map(deps, async (m: Module) => {
      return new BuildTask({
        garden: this.garden,
        module: m,
        force: this.force,
      })
    })
  }

  protected getName() {
    return this.module.name
  }

  getDescription() {
    return `building ${this.module.name}`
  }

  async process(): Promise<BuildResult> {
    const module = this.module

    if (!this.force && (await this.garden.actions.getBuildStatus({ module })).ready) {
      // this is necessary in case other modules depend on files from this one
      await this.garden.buildDir.syncDependencyProducts(this.module)
      return { fresh: false }
    }

    const logEntry = this.garden.log.info({
      section: this.module.name,
      msg: "Building",
      status: "active",
    })

    let result: BuildResult
    try {
      result = await this.garden.actions.build({
        module,
        logEntry,
      })
    } catch (err) {
      logEntry.setError()
      throw err
    }

    logEntry.setSuccess({ msg: chalk.green(`Done (took ${logEntry.getDuration(1)} sec)`), append: true })
    return result
  }
}
