/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import chalk from "chalk"
import { Module, getModuleKey } from "../types/module"
import { BuildResult } from "../types/plugin/module/build"
import { BaseTask, TaskType } from "../tasks/base"
import { Garden } from "../garden"
import { LogEntry } from "../logger/log-entry"
import { StageBuildTask } from "./stage-build"
import { flatten } from "lodash"

export interface BuildTaskParams {
  garden: Garden
  log: LogEntry
  module: Module
  force: boolean
}

export class BuildTask extends BaseTask {
  type: TaskType = "build"

  private module: Module

  constructor({ garden, log, module, force }: BuildTaskParams & { _guard: true }) {
    // Note: The _guard attribute is to prevent accidentally bypassing the factory method
    super({ garden, log, force, version: module.version })
    this.module = module
  }

  static async factory(params: BuildTaskParams): Promise<BaseTask[]> {
    // We need to see if a build step is necessary for the module. If it is, return a build task for the module.
    // Otherwise, return a build task for each of the module's dependencies.
    // We do this to avoid displaying no-op build steps in the stack graph.
    const { garden, log, force } = params

    const buildTask = new BuildTask({ ...params, _guard: true })

    if (params.module.needsBuild) {
      return [buildTask]
    } else {
      const buildTasks = await Bluebird.map(
        Object.values(params.module.buildDependencies),
        (module) =>
          new BuildTask({
            garden,
            log,
            module,
            force,
            _guard: true,
          })
      )
      const stageBuildTask = new StageBuildTask({
        garden,
        log,
        module: params.module,
        force,
        dependencies: buildTasks,
      })
      return [stageBuildTask, ...buildTasks]
    }
  }

  async getDependencies() {
    const dg = await this.garden.getConfigGraph(this.log)
    const deps = await dg.getDependencies({ nodeType: "build", name: this.getName(), recursive: false })

    const buildTasks = flatten(
      await Bluebird.map(deps.build, async (m: Module) => {
        return BuildTask.factory({
          garden: this.garden,
          log: this.log,
          module: m,
          force: this.force,
        })
      })
    )

    const stageBuildTask = new StageBuildTask({
      garden: this.garden,
      log: this.log,
      module: this.module,
      force: this.force,
      dependencies: buildTasks,
    })

    return [stageBuildTask, ...buildTasks]
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

    let log: LogEntry

    const logSuccess = () => {
      if (log) {
        log.setSuccess({
          msg: chalk.green(`Done (took ${log.getDuration(1)} sec)`),
          append: true,
        })
      }
    }

    if (this.force) {
      log = this.log.info({
        section: this.getName(),
        msg: `Building version ${module.version.versionString}...`,
        status: "active",
      })
    } else {
      log = this.log.info({
        section: this.getName(),
        msg: `Getting build status for ${module.version.versionString}...`,
        status: "active",
      })

      const status = await actions.getBuildStatus({ log: this.log, module })

      if (status.ready) {
        logSuccess()
        return { fresh: false }
      }

      log.setState(`Building version ${module.version.versionString}...`)
    }

    const graph = await this.garden.getConfigGraph(log)
    await this.garden.buildDir.syncDependencyProducts(this.module, graph, log)

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
