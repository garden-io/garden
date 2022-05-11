/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import chalk from "chalk"
import pluralize from "pluralize"
import { GardenModule, getModuleKey } from "../types/module"
import { BuildResult } from "../types/plugin/module/build"
import { BaseTask, TaskType } from "../tasks/base"
import { Garden } from "../garden"
import { LogEntry } from "../logger/log-entry"
import { Profile } from "../util/profiling"
import { ConfigGraph } from "../config-graph"

export interface StageBuildTaskParams {
  garden: Garden
  graph: ConfigGraph
  log: LogEntry
  module: GardenModule
  force: boolean
  dependencies?: BaseTask[]
}

@Profile()
export class StageBuildTask extends BaseTask {
  type: TaskType = "stage-build"
  concurrencyLimit = 10

  graph: ConfigGraph
  module: GardenModule
  extraDependencies: BaseTask[]

  constructor({ garden, graph, log, module, force, dependencies }: StageBuildTaskParams) {
    super({ garden, log, force, version: module.version.versionString })
    this.graph = graph
    this.module = module
    this.extraDependencies = dependencies || []
    this.validate()
  }

  async resolveDependencies() {
    const deps = this.graph.getDependencies({ nodeType: "build", name: this.getName(), recursive: false }).build

    const stageDeps = await Bluebird.map(deps, async (m: GardenModule) => {
      return new StageBuildTask({
        garden: this.garden,
        graph: this.graph,
        log: this.log,
        module: m,
        force: this.force,
      })
    })

    return [...stageDeps, ...this.extraDependencies]
  }

  getName() {
    return getModuleKey(this.module.name, this.module.plugin)
  }

  getDescription() {
    return `staging build for ${this.getName()}`
  }

  async process(): Promise<BuildResult> {
    let log: LogEntry | undefined = undefined

    if (this.module.version.files.length > 0) {
      log = this.log.verbose({
        section: this.getName(),
        msg: `Syncing module sources (${pluralize("file", this.module.version.files.length, true)})...`,
        status: "active",
      })
    }

    await this.garden.buildStaging.syncFromSrc(this.module, log || this.log)

    if (log) {
      log.setSuccess({
        msg: chalk.green(`Done (took ${log.getDuration(1)} sec)`),
        append: true,
      })
    }

    return {}
  }
}
