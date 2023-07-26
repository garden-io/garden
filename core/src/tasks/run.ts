/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  ActionTaskProcessParams,
  ActionTaskStatusParams,
  ExecuteActionTask,
  emitGetStatusEvents,
  emitProcessingEvents,
} from "./base"
import { Profile } from "../util/profiling"
import { RunAction } from "../actions/run"
import { GetRunResult } from "../plugin/handlers/Run/get-result"
import { resolvedActionToExecuted } from "../actions/helpers"
import { OtelTraced } from "../util/open-telemetry/decorators"

class RunTaskError extends Error {
  override toString() {
    return this.message
  }
}

@Profile()
export class RunTask extends ExecuteActionTask<RunAction, GetRunResult> {
  type = "run" as const

  getDescription() {
    return this.action.longDescription()
  }

  @OtelTraced({
    name(_params) {
      return `${this.action.key()}.getRunStatus`
    },
    getAttributes(_params) {
      return {
        key: this.action.key(),
        kind: this.action.kind,
      }
    },
  })
  @(emitGetStatusEvents<RunAction>)
  async getStatus({ statusOnly, dependencyResults }: ActionTaskStatusParams<RunAction>) {
    this.log.verbose("Checking status...")
    const router = await this.garden.getActionRouter()
    const action = this.getResolvedAction(this.action, dependencyResults)

    // The default handler (for plugins that don't implement getTaskResult) returns undefined.
    try {
      const { result: status } = await router.run.getResult({
        graph: this.graph,
        action,
        log: this.log,
      })

      this.log.verbose(`Status check complete`)

      if (status.detail === null) {
        return {
          ...status,
          state: "not-ready" as const,
          version: action.versionString(),
          executedAction: resolvedActionToExecuted(action, { status }),
        }
      }

      if (status.state === "ready" && !statusOnly && !this.force) {
        this.log.success("Already complete")
      }

      return {
        ...status,
        version: action.versionString(),
        executedAction: resolvedActionToExecuted(action, { status }),
      }
    } catch (err) {
      this.log.error(`Failed getting status`)

      throw err
    }
  }

  @OtelTraced({
    name(_params) {
      return `${this.action.key()}.run`
    },
    getAttributes(_params) {
      return {
        key: this.action.key(),
        kind: this.action.kind,
      }
    },
  })
  @(emitProcessingEvents<RunAction>)
  async process({ dependencyResults }: ActionTaskProcessParams<RunAction, GetRunResult>) {
    const action = this.getResolvedAction(this.action, dependencyResults)

    const taskLog = this.log.createLog().info("Running...")

    const actions = await this.garden.getActionRouter()

    let status: GetRunResult

    try {
      const output = await actions.run.run({
        graph: this.graph,
        action,
        log: taskLog,
        interactive: false,
      })
      status = output.result
    } catch (err) {
      taskLog.error(`Failed running ${action.name}`)

      throw err
    }
    if (status.state === "ready") {
      taskLog.success(`Done`)
    } else {
      taskLog.error(`Failed!`)
      if (status.detail?.diagnosticErrorMsg) {
        this.log.debug(`Additional context for the error:\n\n${status.detail.diagnosticErrorMsg}`)
      }
      throw new RunTaskError(status.detail?.log)
    }

    return { ...status, version: action.versionString(), executedAction: resolvedActionToExecuted(action, { status }) }
  }
}
