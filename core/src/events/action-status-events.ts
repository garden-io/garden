/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { actionStates } from "../actions/types.js"
import type { BuildState } from "../plugin/handlers/Build/get-status.js"
import type { ActionRuntime, RunState } from "../plugin/plugin.js"
import type { DeployState } from "../types/service.js"
import type { PickFromUnion } from "../util/util.js"

export type ActionStatusDetailedState = DeployState | BuildState | RunState

/**
 * These are the states emitted in status events. Here, we include additional states to help distinguish status event
 * emitted around status/cache checks VS statuses emitted around the execution after a failed status check.
 */
const _actionStateTypesForEvent = [...actionStates, "getting-status", "cached"] as const
/**
 * This type represents the lifecycle of an individual action execution as emitted to Cloud. Note that the
 * internal semantics are slightly different (e.g. Garden uses "ready" instead of "cached" internally).
 *
 * The state transitions that take place when an action goes through the standard "check status and execute the
 * action if no up-to date result exists" flow (as is done in the primary task classes) is as follows:
 *
 * ```
 * initial state: "getting-status"
 * final state: "cached", ready" or "failed"
 *
 * "getting-status" -> "cached" | "not-ready"
 * "not-ready" -> "processing"
 * "processing" -> "ready" | "failed"
 * ```
 *
 * See also the following state transition diagram (created with https://asciiflow.com):
 *
 *                                           ┌──────► (No-op, done)
 *                                           │
 *                                           │ false
 *                                           │
 *                  ┌──► cached ──► force? ──┤
 *                  │                        │
 * getting-status ──┤                        │ true               ┌──► failed
 *                  │                        │                    │
 *                  └──► not-ready  ─────────┴─────► processing ──┤
 *                                                                │
 *                                                                └──► ready
 *
 * The states have the following semantics:
 *
 * - `"unknown"`: A null state used e.g. by default/no-op action handlers.
 *
 * - `"getting-status"`: The status of the action is being checked/fetched.
 *   - For example, for a container build status check, this might involve querying a container registry to see if a
 *     build exists for the requested action's version.
 *   - Or for a Kubernetes deployment, this might involve checking if the requested resources are already live and up
 *     to date.
 *
 * - `"cached"`: This state indicates a cache hit. An up-to-date result exists for the action.
 *   - This state can be reached e.g. when a status check indicates that an up-to-date build artifact / deployed
 *     resource / test result / run result already exists.
 *
 * - `"ready"`: The action was executed successfully, and an up-to-date result exists for the action.
 *   - This state can be reached by successfully processing the action after getting a `"not-ready"` state from the
 *     status check.
 *   - Think of this as "succeeded".
 *   - Note that in the case of Test actions, the action itself will return a "ready" state even if the test itself
 *     failed, because the action execution was successful.
 *
 * - `"not-ready"`: No result (or no healthy result) for the action exists with the requested version.
 *   - This state is reached by a status check that doesn't find an up-to-date result (e.g. no up-to-date container
 *     image, or a deployed resource that's missing, unhealthy, stopped or out of date with the requested action's
 *     version).
 *
 * - `"processing"`: The action is being executed.
 *
 * - `"failed"`: Getting the status or processing the action failed with an unexpected error so no up-to-date
 *   result was created for the action.
 *   - Note that in the case of Test actions, this does not suggest that the underlying test failed, but rather
 *     that the action itself failed and the test status is simply unknown.
 */
export type ActionStateForEvent = (typeof _actionStateTypesForEvent)[number]

interface ActionStatusPayloadBase {
  actionName: string
  /**
   * Same as action kind. Accidentally introduced into the payload.
   *
   * FIXME: For some reason this field was in the actual payload but not in the interface.
   * We now we have Cloud depending on it, so we can't just remove it. But obviously this
   * should've been actionKind.
   */
  actionType: string
  actionKind: string
  actionVersion: string
  actionUid: string
  /**
   * Whether the event was emitted while getting the status of the action or processing (i.e. executing)
   * the action.
   *
   * This can technically be deduced from the "state" field, except when the state is "failed",
   * so we include it here for good measure.
   */
  operation: "getStatus" | "process"
  moduleName: string | null // DEPRECATED: Remove in 0.14
  /**
   * ISO format date string
   */
  startedAt: string
  state: ActionStateForEvent
  force: boolean
  /**
   * The session ID for the command run the action belongs to.
   */
  sessionId: string
  /**
   * Runtime information about the action. It can be undefined in some cases, e.g. if the getting-status handler failed.
   *
   * Currently runtime information is only provided for build actions, but feel free to change that if we need runtime information for other action kinds in Cloud.
   */
  runtime: ActionRuntime | undefined
}

type ActionIncompleteState = PickFromUnion<ActionStateForEvent, "getting-status" | "unknown">
type ActionProcessingState = PickFromUnion<ActionStateForEvent, "processing">
type ActionFailedState = PickFromUnion<ActionStateForEvent, "failed">
export type ActionCompleteState = PickFromUnion<ActionStateForEvent, "ready" | "not-ready" | "cached">

export interface ActionIncompleteStatusPayload extends ActionStatusPayloadBase {
  state: ActionIncompleteState
  status: { state: "unknown" }
}

export interface ActionProcessingStatusPayload extends ActionStatusPayloadBase {
  state: ActionProcessingState
  status: { state: "building" } | { state: "deploying" } | { state: "running" }
}

export interface ActionCompleteStatusPayloadBase extends ActionStatusPayloadBase {
  /**
   * ISO format date string
   */
  completedAt: string
}

export interface ActionFailedStatusPayload extends ActionCompleteStatusPayloadBase {
  state: ActionFailedState
  status: { state: "unknown" }
}

export interface ActionCompleteStatusPayload<S = { state: ActionStatusDetailedState }>
  extends ActionCompleteStatusPayloadBase {
  state: ActionCompleteState
  status: S
}

export type ActionStatusPayload<S = { state: ActionStatusDetailedState }> =
  | ActionIncompleteStatusPayload
  | ActionProcessingStatusPayload
  | ActionFailedStatusPayload
  | ActionCompleteStatusPayload<S>
