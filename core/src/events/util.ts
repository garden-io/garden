/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ValidExecutionActionResultType } from "../tasks/base.js"
import { type Action, type ActionState } from "../actions/types.js"
import type { DeployStatus } from "../plugin/handlers/Deploy/get-status.js"
import type { DeployStatusForEventPayload } from "../types/service.js"
import type { Events, ActionStatusEventName } from "./events.js"
import { pick } from "lodash-es"
import type { BuildState } from "../plugin/handlers/Build/get-status.js"
import type { ActionStatusDetailedState, ActionCompleteState } from "./action-status-events.js"
import type { ActionRuntime } from "../plugin/base.js"

type ActionKind = "build" | "deploy" | "run" | "test"

const processingToDetailStateMap = {
  build: "building",
  deploy: "deploying",
  test: "running",
  run: "running",
} satisfies { [key in ActionKind]: ActionStatusDetailedState }

// Technically a given action can have a result where the state is still processing.
//
// E.g. if "getStatus" is called on the action while it's still running.
// In this case, the "getStatus" call returns a "processing" action state, somewhat counter intuitively,
// since the action did indeed finish getting the status.
//
// In the context of events sent to Cloud though, we enforce that an action that is returning
// results has state of type 'ActionCompleteState'.
//
// In fact, that should always be the case in this context.
//
// We therefore map the ActionState to ActionCompleteState before emitting the event.
//
// TODO: Explore whether we should enforce that action results have state of type
// 'ActionCompleteState' internally as well.
const actionStateToStatusEventCompleteStateMap = {
  "ready": "ready",
  "not-ready": "not-ready",
  // The states below shouldn't really occur in this context.
  "processing": "not-ready",
  "failed": "not-ready",
  "unknown": "not-ready",
} satisfies { [key in ActionState]: ActionCompleteState }

function getStatusEventCompleteState(state: ActionState, operation: "getStatus" | "process") {
  if (operation === "getStatus") {
    return state === "ready" ? "cached" : "not-ready"
  }
  return actionStateToStatusEventCompleteStateMap[state]
}

export function makeActionStatusPayloadBase({
  action,
  force,
  operation,
  startedAt,
  sessionId,
  runtime,
}: {
  action: Action
  force: boolean
  operation: "getStatus" | "process"
  startedAt: string
  sessionId: string
  runtime: ActionRuntime | undefined
}) {
  return {
    actionName: action.name,
    actionVersion: action.versionString(),
    // NOTE: The type/kind needs to be lower case in the event payload
    actionKind: action.kind.toLowerCase(),
    actionType: action.type,
    actionUid: action.uid,
    moduleName: action.moduleName(),
    sessionId,
    startedAt,
    operation,
    force,
    runtime,
  }
}

/**
 * The payload for the event that's emitted before getting the action status, ahead
 * of actually processing it.
 *
 * After the status has been fetched we emit a action complete (e.g. "cached" / "not-ready") or action failed event.
 */
export function makeActionGetStatusPayload({
  action,
  force,
  startedAt,
  sessionId,
  runtime,
}: {
  action: Action
  force: boolean
  startedAt: string
  sessionId: string
  runtime: ActionRuntime | undefined
}) {
  const payloadAttrs = makeActionStatusPayloadBase({
    action,
    force,
    startedAt,
    sessionId,
    runtime,
    operation: "getStatus",
  })

  const payload = {
    ...payloadAttrs,
    state: "getting-status",
    status: { state: "unknown" },
  } satisfies Events[ActionStatusEventName]

  return payload
}

/**
 * The payload for the event that's emitted _before_ processing a action (but _after_ getting its status.)
 *
 * After processing we emit a action complete (i.e. "ready") or action failed event.
 */
export function makeActionProcessingPayload({
  action,
  force,
  startedAt,
  sessionId,
  runtime,
}: {
  action: Action
  force: boolean
  startedAt: string
  sessionId: string
  runtime: ActionRuntime | undefined
}) {
  const payloadAttrs = makeActionStatusPayloadBase({
    action,
    force,
    startedAt,
    sessionId,
    runtime,
    operation: "process",
  })
  const actionKind = action.kind.toLowerCase() as Lowercase<Action["kind"]>

  const payload = {
    ...payloadAttrs,
    state: "processing",
    status: { state: processingToDetailStateMap[actionKind] },
  } satisfies Events[ActionStatusEventName]

  return payload
}

/**
 * The payload for the event that's emitted after we fetch the action status successfully OR after we process
 * the action successfully.
 *
 * Note that different action kinds will have different result shapes which makes the function a bit verbose,
 * but here we're erring on making things explicit and also type correctness via the 'satisfies' keyword.
 */
export function makeActionCompletePayload<
  A extends Action,
  R extends ValidExecutionActionResultType = {
    state: ActionState
    outputs: A["_runtimeOutputs"]
    detail: any
    version: string
  },
>({
  result,
  action,
  force,
  operation,
  startedAt,
  sessionId,
  runtime,
}: {
  result: R
  action: Action
  force: boolean
  operation: "getStatus" | "process"
  startedAt: string
  sessionId: string
  runtime: ActionRuntime | undefined
}) {
  const payloadAttrs = makeActionStatusPayloadBase({ action, force, operation, startedAt, sessionId, runtime })
  const actionKind = action.kind.toLowerCase() as Lowercase<Action["kind"]>

  // Map the result state to one of the allowed "complete" states.
  const state = getStatusEventCompleteState(result.state, operation)

  // The following is a little verbose but erring on type safety via the "satisfies" key word
  switch (actionKind) {
    case "build":
      let buildDetailState: BuildState
      if (operation === "getStatus") {
        buildDetailState = result.state === "ready" ? "fetched" : "outdated"
      } else {
        buildDetailState = result.state === "ready" ? "built" : "unknown"
      }
      return {
        ...payloadAttrs,
        completedAt: new Date().toISOString(),
        state,
        status: { state: buildDetailState },
      } satisfies Events["buildStatus"]

    case "deploy":
      const deployResult = result as DeployStatus
      let deployStatus: DeployStatusForEventPayload
      if (!deployResult.detail) {
        deployStatus = { state: "unknown" }
      } else {
        deployStatus = pick(deployResult.detail, [
          "createdAt",
          "mode",
          "externalId",
          "externalVersion",
          "forwardablePorts",
          "ingresses",
          "lastMessage",
          "lastError",
          "outputs",
          "runningReplicas",
          "state",
          "updatedAt",
        ])
      }

      return {
        ...payloadAttrs,
        completedAt: new Date().toISOString(),
        state,
        status: deployStatus,
      } satisfies Events["deployStatus"]
    case "test":
    case "run":
      const runDetailState = result.detail ? (result.detail.success ? "succeeded" : "failed") : "unknown"
      return {
        ...payloadAttrs,
        completedAt: new Date().toISOString(),
        state,
        status: { state: runDetailState },
      } satisfies Events["testStatus"] | Events["runStatus"]
  }
}

/**
 * The payload for the event that's emitted if fetching the action status OR processing the
 * action fails.
 */
export function makeActionFailedPayload({
  action,
  force,
  operation,
  startedAt,
  sessionId,
  runtime,
}: {
  action: Action
  force: boolean
  operation: "getStatus" | "process"
  startedAt: string
  sessionId: string
  runtime: ActionRuntime | undefined
}) {
  const payloadAttrs = makeActionStatusPayloadBase({ action, force, operation, startedAt, sessionId, runtime })

  const payload = {
    ...payloadAttrs,
    completedAt: new Date().toISOString(),
    state: "failed",
    status: { state: "unknown" },
  } satisfies Events[ActionStatusEventName]

  return payload
}
