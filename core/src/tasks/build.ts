/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { ActionTaskProcessParams, ActionTaskStatusParams, ExecuteActionTask } from "../tasks/base"
import { Profile } from "../util/profiling"
import { BuildAction } from "../actions/build"
import pluralize from "pluralize"
import { BuildStatus } from "../plugin/handlers/Build/get-status"
import { resolvedActionToExecuted } from "../actions/helpers"
import { renderDuration } from "../logger/util"
import { stateForCacheStatusEvent } from "../actions/types"

@Profile()
export class BuildTask extends ExecuteActionTask<BuildAction, BuildStatus> {
  type = "build" as const
  concurrencyLimit = 5
  eventName = "buildStatus" as const

  getDescription() {
    return this.action.longDescription()
  }

  async getStatus({ statusOnly, dependencyResults }: ActionTaskStatusParams<BuildAction>) {
    const router = await this.garden.getActionRouter()
    const action = this.getResolvedAction(this.action, dependencyResults)

    if (!statusOnly) {
      // NOTE: Previously we set the state to "fetching", now we're setting it to "unknown" which is consistent
      // with other actions.
      this.emitStatus({ state: "getting-status" })
    }

    const output = await router.build.getStatus({ log: this.log, graph: this.graph, action })
    const status = output.result

    if (!statusOnly) {
      this.emitStatus({
        state: stateForCacheStatusEvent(status.state),
        status: { state: status.state === "ready" ? "fetched" : "outdated" },
      })
    }

    if (status.state === "ready" && !statusOnly && !this.force) {
      this.log.info(`Already built`)
    }

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

    const log = this.log
    const files = action.getFullVersion().files

    if (files.length > 0) {
      log.verbose(`Syncing sources (${pluralize("file", files.length, true)})...`)
    }

    await this.garden.buildStaging.syncFromSrc({
      action,
      log: log || this.log,
    })

    log.verbose(chalk.green(`Done syncing sources ${renderDuration(log.getDuration(1))}`))

    await this.garden.buildStaging.syncDependencyProducts(action, log)

    this.emitStatus({ state: "processing" })

    try {
      const { result } = await router.build.build({
        graph: this.graph,
        action,
        log,
      })
      log.success(`Done`)
      this.emitStatus({ state: "ready", status: { state: "built" } })

      return {
        ...result,
        version: action.versionString(),
        executedAction: resolvedActionToExecuted(action, { status: result }),
      }
    } catch (err) {
      log.error(`Build failed`)
      this.emitStatus({ state: "failed" })
      // this.emitStatus("failed", { state: "failed" })

      throw err
    }
  }
}
