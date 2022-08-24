/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { BaseActionTaskParams, ActionTaskProcessParams, ActionTaskStatusParams, ExecuteActionTask } from "../tasks/base"
import { Profile } from "../util/profiling"
import { BuildAction } from "../actions/build"
import pluralize from "pluralize"
import { BuildStatus } from "../plugin/handlers/build/get-status"

export interface BuildTaskParams extends BaseActionTaskParams<BuildAction> {
  force: boolean
}

@Profile()
export class BuildTask extends ExecuteActionTask<BuildAction, BuildStatus> {
  type = "build"
  concurrencyLimit = 5

  getDescription() {
    return this.action.longDescription()
  }

  async getStatus({ dependencyResults }: ActionTaskStatusParams<BuildAction>) {
    const router = await this.garden.getActionRouter()
    const action = this.getResolvedAction(this.action, dependencyResults)
    const status = await router.build.getStatus({ log: this.log, graph: this.graph, action })
    return { ...status, executedAction: action.execute({ status }) }
  }

  async process({ dependencyResults }: ActionTaskProcessParams<BuildAction, BuildStatus>) {
    const router = await this.garden.getActionRouter()
    const action = this.getResolvedAction(this.action, dependencyResults)

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

      return { ...result, executedAction: action.execute({ status: result }) }
    } catch (err) {
      log.setError()
      throw err
    }
  }
}
