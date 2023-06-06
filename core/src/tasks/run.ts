/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ActionTaskProcessParams, ActionTaskStatusParams, ExecuteActionTask } from "./base"
import { Profile } from "../util/profiling"
import { RunAction } from "../actions/run"
import { GetRunResult } from "../plugin/handlers/Run/get-result"
import { resolvedActionToExecuted } from "../actions/helpers"
import { makeActionStatusEventPayloadBase } from "./util"
import { ActionStateForEvent, stateForCacheStatusEvent } from "../actions/types"
import { runStatusForEventPayload } from "../plugin/plugin"
import { Events } from "../events"

class RunTaskError extends Error {
  toString() {
    return this.message
  }
}

@Profile()
export class RunTask extends ExecuteActionTask<RunAction, GetRunResult> {
  type = "run" as const
  eventName = "runStatus" as const

  getDescription() {
    return this.action.longDescription()
  }

  async getStatus({ statusOnly, dependencyResults }: ActionTaskStatusParams<RunAction>) {
    this.log.verbose("Checking status...")
    const router = await this.garden.getActionRouter()
    const action = this.getResolvedAction(this.action, dependencyResults)

    const payloadAttrs = makeActionStatusEventPayloadBase(action)

    // TODO @eysi: Should this be status only?
    if (!statusOnly) {
      this.emitStatus({ state: "getting-status" })
    }

    // The default handler (for plugins that don't implement getTaskResult) returns undefined.
    try {
      const { result: status } = await router.run.getResult({
        graph: this.graph,
        action,
        log: this.log,
      })

      this.log.verbose(`Status check complete`)

      // Should return a null value here if there is no result
      if (status.detail === null) {
        return null
      }

      if (status.state === "ready" && !statusOnly && !this.force) {
        this.log.success("Already complete")
      }

      if (!statusOnly) {
        // TODO @eysi: Validate payload function
        this.emitStatus({
          state: stateForCacheStatusEvent(status.state),
          status: runStatusForEventPayload(status.detail),
        })
      }

      return {
        ...status,
        version: action.versionString(),
        executedAction: resolvedActionToExecuted(action, { status }),
      }
    } catch (err) {
      this.log.error(`Failed getting status`)

      if (!statusOnly) {
        this.emitStatus({ state: "failed" })
        // this.emitStatus("failed", { state: "unknown" })
      }

      throw err
    }
  }

  async process({ dependencyResults }: ActionTaskProcessParams<RunAction, GetRunResult>) {
    const action = this.getResolvedAction(this.action, dependencyResults)

    const taskLog = this.log.createLog().info("Running...")

    this.emitStatus({ state: "processing" })

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

      this.emitStatus({ state: status.state, status: runStatusForEventPayload(status.detail) })
    } catch (err) {
      taskLog.error(`Failed running ${action.name}`)
      this.emitStatus({ state: "failed" })
      // this.emitStatus("failed", { state: "unknown" })

      throw err
    }
    if (status.state === "ready") {
      taskLog.success(`Done`)
    } else {
      taskLog.error(`Failed!`)
      throw new RunTaskError(status.detail?.log)
    }

    return { ...status, version: action.versionString(), executedAction: resolvedActionToExecuted(action, { status }) }
  }
}
