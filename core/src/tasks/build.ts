/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { BaseActionTaskParams, ActionTaskProcessParams, ActionTaskStatusParams } from "../tasks/base.js"
import { ExecuteActionTask, logAndEmitGetStatusEvents, logAndEmitProcessingEvents } from "../tasks/base.js"
import { Profile } from "../util/profiling.js"
import type { BuildAction, BuildActionConfig, ResolvedBuildAction } from "../actions/build.js"
import pluralize from "pluralize"
import type { BuildStatus } from "../plugin/handlers/Build/get-status.js"
import { resolvedActionToExecuted } from "../actions/helpers.js"
import { renderDuration } from "../logger/util.js"
import { OtelTraced } from "../util/open-telemetry/decorators.js"
import { wrapActiveSpan } from "../util/open-telemetry/spans.js"
import { makeGetStatusLog } from "./helpers.js"

@Profile()
export class BuildTask extends ExecuteActionTask<BuildAction, BuildStatus> {
  readonly type = "build" as const
  override defaultStatusConcurrencyLimit = 5
  override defaultExecuteConcurrencyLimit = 5
  eventName = "buildStatus" as const

  getDescription() {
    return this.action.longDescription()
  }

  @OtelTraced({
    name(_params) {
      return `${this.action.key()}.getBuildStatus`
    },
    getAttributes(_params) {
      return {
        key: this.action.key(),
        kind: this.action.kind,
      }
    },
  })
  @(logAndEmitGetStatusEvents<BuildAction>)
  async getStatus({ statusOnly, dependencyResults }: ActionTaskStatusParams<BuildAction>) {
    const router = await this.garden.getActionRouter()
    const action = this.getResolvedAction(this.action, dependencyResults)

    const log = makeGetStatusLog(this.log, this.force)
    const output = await router.build.getStatus({ log, graph: this.graph, action })
    const status = output.result

    if (status.state === "ready" && !statusOnly && !this.force) {
      await this.ensureBuildContext(action)
    }

    return {
      ...status,
      version: action.versionString(log),
      executedAction: resolvedActionToExecuted(action, { status }),
    }
  }

  @OtelTraced({
    name(_params) {
      return `${this.action.key()}.build`
    },
    getAttributes(_params) {
      return {
        key: this.action.key(),
        kind: this.action.kind,
      }
    },
  })
  @(logAndEmitProcessingEvents<BuildAction>)
  async process({ dependencyResults }: ActionTaskProcessParams<BuildAction, BuildStatus>) {
    const router = await this.garden.getActionRouter()
    const action = this.getResolvedAction(this.action, dependencyResults)

    if (action.isDisabled()) {
      this.log.info(
        `${action.longDescription()} is disabled, but is being executed because another action depends on it.`
      )
    }

    const log = this.log
    await this.buildStaging(action)

    console.log("Running build task", action.name)

    try {
      const { result } = await wrapActiveSpan("build", () =>
        router.build.build({
          graph: this.graph,
          action,
          log,
        })
      )

      return {
        ...result,
        version: action.versionString(log),
        executedAction: resolvedActionToExecuted(action, { status: result }),
      }
    } catch (err) {
      throw err
    }
  }

  private async ensureBuildContext(action: ResolvedBuildAction<BuildActionConfig>) {
    const buildContextExists = await this.garden.buildStaging.actionBuildPathExists(action)
    if (!buildContextExists) {
      await this.buildStaging(action)
    }
  }

  private async buildStaging(action: ResolvedBuildAction<BuildActionConfig>) {
    const log = this.log
    const files = action.getFullVersion(log).files

    if (files.length > 0) {
      log.verbose(`Syncing sources (${pluralize("file", files.length, true)})...`)
    }

    await wrapActiveSpan("syncSources", async (span) => {
      span.setAttributes({
        "garden.filesSynced": files.length,
      })
      await this.garden.buildStaging.syncFromSrc({
        action,
        log: log || this.log,
      })
    })

    log.verbose(`Done syncing sources ${renderDuration(log.getDuration(1))}`)

    await wrapActiveSpan("syncDependencyProducts", async () => {
      await this.garden.buildStaging.syncDependencyProducts(action, log)
    })
  }
}

export function createBuildTask(params: BaseActionTaskParams<BuildAction>) {
  return new BuildTask(params)
}
