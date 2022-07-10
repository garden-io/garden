/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { BaseActionTaskParams, BaseActionTask, TaskType, ActionTaskProcessParams } from "../tasks/base"
import { Profile } from "../util/profiling"
import { BuildAction } from "../actions/build"
import pluralize from "pluralize"
import { BuildResult } from "../plugin/handlers/build/build"
import { BuildStatus } from "../plugin/handlers/build/get-status"

export interface BuildTaskParams extends BaseActionTaskParams<BuildAction> {
  force: boolean
}

@Profile()
export class BuildTask extends BaseActionTask<BuildAction, BuildResult, BuildStatus> {
  type: TaskType = "build"
  concurrencyLimit = 5

  getDescription() {
    return `building ${this.action.longDescription()}`
  }

  async getStatus({ resolvedAction: action }: ActionTaskProcessParams<BuildAction>) {
    const router = await this.garden.getActionRouter()
    return router.build.getStatus({ log: this.log, graph: this.graph, action })
  }

  async process({ resolvedAction: action }: ActionTaskProcessParams<BuildAction>) {
    const router = await this.garden.getActionRouter()

    let log = this.log.info({
      section: this.getName(),
      msg: `Building version ${this.version}...`,
      status: "active",
    })

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

    await this.garden.buildStaging.syncDependencyProducts(action, log)

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
