/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { BaseActionTaskParams, ActionTaskProcessParams, ActionTaskStatusParams } from "./base.js"
import { ExecuteActionTask, logAndEmitGetStatusEvents, logAndEmitProcessingEvents } from "./base.js"
import { Profile } from "../util/profiling.js"
import type { RunAction } from "../actions/run.js"
import type { GetRunResult } from "../plugin/handlers/Run/get-result.js"
import { resolvedActionToExecuted } from "../actions/helpers.js"
import { OtelTraced } from "../util/open-telemetry/decorators.js"
import { GardenError } from "../exceptions.js"
import { makeGetStatusLog } from "./helpers.js"

/**
 * Only throw this error when the run itself failed, and not when Garden failed to execute the run.
 *
 * Unexpected errors should just bubble up; When the task ran successfully, but it reported a failure (e.g. linter found issues).
 *
 * TODO: This probably should not be handled with an exception and instead just be an object that represents a run failure or success.
 *   For now however, we use the error and should be careful with how we use it.
 */
class RunFailedError extends GardenError {
  override type = "run-failed"
}

@Profile()
export class RunTask extends ExecuteActionTask<RunAction, GetRunResult> {
  readonly type = "run" as const

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
  @(logAndEmitGetStatusEvents<RunAction>)
  async getStatus({ dependencyResults }: ActionTaskStatusParams<RunAction>) {
    const router = await this.garden.getActionRouter()
    const action = this.getResolvedAction(this.action, dependencyResults)
    const log = makeGetStatusLog(this.log, this.force)

    // The default handler (for plugins that don't implement getTaskResult) returns undefined.
    try {
      const { result: status } = await router.run.getResult({
        graph: this.graph,
        action,
        log,
      })

      if (status.detail === null) {
        return {
          ...status,
          state: "not-ready" as const,
          version: action.versionString(log),
          executedAction: resolvedActionToExecuted(action, { status }),
        }
      }

      return {
        ...status,
        version: action.versionString(log),
        executedAction: resolvedActionToExecuted(action, { status }),
      }
    } catch (err) {
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
  @(logAndEmitProcessingEvents<RunAction>)
  async process({ dependencyResults }: ActionTaskProcessParams<RunAction, GetRunResult>) {
    const action = this.getResolvedAction(this.action, dependencyResults)
    const taskLog = this.log.createLog()
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
      throw err
    }
    if (status.state !== "ready") {
      if (status.detail?.diagnosticErrorMsg) {
        this.log.debug(`Additional context for the error:\n\n${status.detail.diagnosticErrorMsg}`)
      }
      throw new RunFailedError({ message: status.detail?.log || "The run failed, but it did not output anything." })
    }

    return {
      ...status,
      version: action.versionString(taskLog),
      executedAction: resolvedActionToExecuted(action, { status }),
    }
  }
}

export function createRunTask(params: BaseActionTaskParams<RunAction>) {
  return new RunTask(params)
}
