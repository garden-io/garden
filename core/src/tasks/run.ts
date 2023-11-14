/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { BaseActionTaskParams, ActionTaskProcessParams, ActionTaskStatusParams } from "./base.js"
import { ExecuteActionTask, emitGetStatusEvents, emitProcessingEvents } from "./base.js"
import { Profile } from "../util/profiling.js"
import type { RunAction } from "../actions/run.js"
import type { GetRunResult } from "../plugin/handlers/Run/get-result.js"
import { resolvedActionToExecuted } from "../actions/helpers.js"
import { OtelTraced } from "../util/open-telemetry/decorators.js"
import { GardenError } from "../exceptions.js"

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
      throw new RunFailedError({ message: status.detail?.log || "The run failed, but it did not output anything." })
    }

    return { ...status, version: action.versionString(), executedAction: resolvedActionToExecuted(action, { status }) }
  }
}

export function createRunTask(params: BaseActionTaskParams<RunAction>) {
  return new RunTask(params)
}
