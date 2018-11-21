/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Bluebird from "bluebird"
import chalk from "chalk"
import { Module, getModuleKey } from "../types/module"
import { BuildResult } from "../types/plugin/outputs"
import { BaseTask } from "../tasks/base"
import { Garden } from "../garden"
import { DependencyGraphNodeType } from "../dependency-graph"
import { getHotReloadModuleNames } from "./helpers"

export interface BuildTaskParams {
  garden: Garden
  module: Module
  force: boolean
  fromWatch?: boolean
  hotReloadServiceNames?: string[]
}

export class BuildTask extends BaseTask {
  type = "build"
  depType: DependencyGraphNodeType = "build"

  private module: Module
  private fromWatch: boolean
  private hotReloadServiceNames: string[]

  constructor({ garden, module, force, fromWatch = false, hotReloadServiceNames = [] }: BuildTaskParams) {
    super({ garden, force, version: module.version })
    this.module = module
    this.fromWatch = fromWatch
    this.hotReloadServiceNames = hotReloadServiceNames
  }

  async getDependencies(): Promise<BuildTask[]> {
    const dg = await this.garden.getDependencyGraph()
    const hotReloadModuleNames = await getHotReloadModuleNames(this.garden, this.hotReloadServiceNames)

    // We ignore build dependencies on modules with services deployed with hot reloading
    const deps = (await dg.getDependencies(this.depType, this.getName(), false)).build
      .filter(module => !hotReloadModuleNames.has(module.name))

    return Bluebird.map(deps, async (m: Module) => {
      return new BuildTask({
        garden: this.garden,
        module: m,
        force: this.force,
        fromWatch: this.fromWatch,
        hotReloadServiceNames: this.hotReloadServiceNames,
      })
    })
  }

  protected getName() {
    return getModuleKey(this.module.name, this.module.plugin)
  }

  getDescription() {
    return `building ${this.getName()}`
  }

  async process(): Promise<BuildResult> {
    const module = this.module

    if (!this.force && (await this.garden.actions.getBuildStatus({ module })).ready) {
      // this is necessary in case other modules depend on files from this one
      await this.garden.buildDir.syncDependencyProducts(this.module)
      return { fresh: false }
    }

    const logEntry = this.garden.log.info({
      section: this.getName(),
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
