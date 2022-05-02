/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import chalk from "chalk"
import { GardenModule } from "../types/module"
import { BaseActionTaskParams, BaseActionTask, TaskType } from "../tasks/base"
import { Garden } from "../garden"
import { LogEntry } from "../logger/log-entry"
import { flatten } from "lodash"
import { Profile } from "../util/profiling"
import { ConfigGraph } from "../graph/config-graph"
import { BuildAction } from "../actions/build"
import pluralize from "pluralize"

export interface BuildTaskParams<T = BuildAction> extends BaseActionTaskParams<T> {
  garden: Garden
  graph: ConfigGraph
  log: LogEntry
  force: boolean
}

@Profile()
export class BuildTask extends BaseActionTask<BuildAction> {
  type: TaskType = "build"
  concurrencyLimit = 5
  graph: ConfigGraph

  constructor({ garden, graph, log, action, force }: BuildTaskParams<BuildAction> & { _guard: true }) {
    // Note: The _guard attribute is to prevent accidentally bypassing the factory method
    super({ garden, log, force, action, graph })
    this.graph = graph
    this.action = action
  }

  async resolveDependencies() {
    const deps = this.graph.getDependencies({ kind: "build", name: this.getName(), recursive: false })

    const buildTasks = flatten(
      await Bluebird.map(deps.build, async (m: GardenModule) => {
        return new BuildTask({
          garden: this.garden,
          graph: this.graph,
          log: this.log,
          module: m,
          force: this.force,
        })
      })
    )

    return buildTasks
  }

  getDescription() {
    return `building ${this.action.description()}`
  }

  async process() {
    const action = this.action
    const router = await this.garden.getActionRouter()

    let log: LogEntry

    if (this.force) {
      log = this.log.info({
        section: this.getName(),
        msg: `Building version ${this.version}...`,
        status: "active",
      })
    } else {
      log = this.log.info({
        section: this.getName(),
        msg: `Getting build status for ${this.version}...`,
        status: "active",
      })

      const status = await router.build.getStatus({ log: this.log, graph: this.graph, action })

      if (status.ready) {
        log.setSuccess({
          msg: chalk.green(`Already built`),
          append: true,
        })
        return { fresh: false }
      }

      log.setState(`Building version ${this.version}...`)
    }

    const files = action.getFullVersion().files

    if (files.length > 0) {
      log = this.log.verbose({
        section: this.getName(),
        msg: `Syncing module sources (${pluralize("file", files.length, true)})...`,
        status: "active",
      })
    }

    await this.garden.buildStaging.syncFromSrc(action, log || this.log)

    if (log) {
      log.setSuccess({
        msg: chalk.green(`Done (took ${log.getDuration(1)} sec)`),
        append: true,
      })
    }

    await this.garden.buildStaging.syncDependencyProducts(action, this.graph, log)

    try {
      const result = await router.build.build({
        graph: this.graph,
        action,
        log,
      })
      log.setSuccess({
        msg: chalk.green(`Done (took ${log.getDuration(1)} sec)`),
        append: true,
      })
      return result
    } catch (err) {
      log.setError()
      throw err
    }
  }
}
