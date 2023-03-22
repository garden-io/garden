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
import { BuildStatus } from "../plugin/handlers/Build/get-status"
import { resolvedActionToExecuted } from "../actions/helpers"

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
    const output = await router.build.getStatus({ log: this.log, graph: this.graph, action })
    const status = output.result
    return { ...status, version: action.versionString(), executedAction: resolvedActionToExecuted(action, { status }) }
  }

  async process({ dependencyResults }: ActionTaskProcessParams<BuildAction, BuildStatus>) {
    const router = await this.garden.getActionRouter()
    const action = this.getResolvedAction(this.action, dependencyResults)

    if (action.isDisabled()) {
      this.log.info(
        `${action.longDescription()} is disabled, but is being executed because another action depends on it.`
      )
    }

    const log = this.log.info(`Building version ${action.versionString()}...`)

    const files = action.getFullVersion().files

    if (files.length > 0) {
      log.verbose(`Syncing sources (${pluralize("file", files.length, true)})...`)
    }

    await this.garden.buildStaging.syncFromSrc({
      action,
      log: log || this.log,
    })

    log.verbose(chalk.green(`Done syncing sources (took ${log.getDuration(1)} sec)`))

    await this.garden.buildStaging.syncDependencyProducts(action, log)

    try {
      const { result } = await router.build.build({
        graph: this.graph,
        action,
        log,
      })
      // TODO @eysi: Verify duration
      log.success(`Done`)

      return {
        ...result,
        version: action.versionString(),
        executedAction: resolvedActionToExecuted(action, { status: result }),
      }
    } catch (err) {
      log.error(`Build failed`)
      throw err
    }
  }
}
