/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import chalk from "chalk"
import { GardenModule, getModuleKey } from "../types/module"
import { BuildResult } from "../types/plugin/module/build"
import { BaseTask, TaskType } from "../tasks/base"
import { Garden } from "../garden"
import { LogEntry } from "../logger/log-entry"
import { StageBuildTask } from "./stage-build"
import { flatten } from "lodash"
import { Profile } from "../util/profiling"
import { ConfigGraph } from "../config-graph"

export interface BuildTaskParams {
  garden: Garden
  graph: ConfigGraph
  log: LogEntry
  module: GardenModule
  force: boolean
}

@Profile()
export class BuildTask extends BaseTask {
  type: TaskType = "build"
  concurrencyLimit = 5
  graph: ConfigGraph
  module: GardenModule

  constructor({ garden, graph, log, module, force }: BuildTaskParams & { _guard: true }) {
    // Note: The _guard attribute is to prevent accidentally bypassing the factory method
    super({ garden, log, force, version: module.version.versionString })
    this.graph = graph
    this.module = module
    this.validate()
  }

  static async factory(params: BuildTaskParams): Promise<BaseTask[]> {
    // We need to see if a build step is necessary for the module. If it is, return a build task for the module.
    // Otherwise, return a build task for each of the module's dependencies.
    // We do this to avoid displaying no-op build steps in the stack graph.
    const { garden, graph, log, force } = params

    const buildTask = new BuildTask({ ...params, _guard: true })

    if (params.module.needsBuild) {
      return [buildTask]
    } else {
      const buildTasks = await Bluebird.map(
        Object.values(params.module.buildDependencies),
        (module) =>
          new BuildTask({
            garden,
            graph,
            log,
            module,
            force,
            _guard: true,
          })
      )
      const stageBuildTask = new StageBuildTask({
        garden,
        graph,
        log,
        module: params.module,
        force,
        dependencies: buildTasks,
      })
      return [stageBuildTask, ...buildTasks]
    }
  }

  async resolveDependencies() {
    const deps = this.graph.getDependencies({ nodeType: "build", name: this.getName(), recursive: false })

    const buildTasks = flatten(
      await Bluebird.map(deps.build, async (m: GardenModule) => {
        return BuildTask.factory({
          garden: this.garden,
          graph: this.graph,
          log: this.log,
          module: m,
          force: this.force,
        })
      })
    )

    const stageBuildTask = new StageBuildTask({
      garden: this.garden,
      graph: this.graph,
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

      const status = await actions.getBuildStatus({ log: this.log, graph: this.graph, module })

      if (status.ready) {
        log.setSuccess({
          msg: chalk.green(`Already built`),
          append: true,
        })
        return { fresh: false }
      }

      log.setState(`Building version ${module.version.versionString}...`)
    }

    await this.garden.buildStaging.syncDependencyProducts(this.module, this.graph, log)

    let result: BuildResult
    try {
      result = await actions.build({
        graph: this.graph,
        module,
        log,
      })
    } catch (err) {
      log.setError()
      throw err
    }

    log.setSuccess({
      msg: chalk.green(`Done (took ${log.getDuration(1)} sec)`),
      append: true,
    })
    return result
  }
}
