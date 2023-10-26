/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { fromPairs, memoize } from "lodash"
import { joi } from "../config/common"
import { Garden } from "../garden"
import { createActionLog, Log } from "../logger/log-entry"
import { renderDivider } from "../logger/util"
import { getLinkedSources } from "../util/ext-source-util"
import { buildActionConfigSchema, ExecutedBuildAction, isBuildAction, ResolvedBuildAction } from "./build"
import { deployActionConfigSchema, ExecutedDeployAction, isDeployAction, ResolvedDeployAction } from "./deploy"
import { ExecutedRunAction, isRunAction, ResolvedRunAction, runActionConfigSchema } from "./run"
import { ExecutedTestAction, isTestAction, ResolvedTestAction, testActionConfigSchema } from "./test"
import type { Action, ActionState, ExecuteActionParams, Executed, ResolveActionParams, ResolvedAction } from "./types"
import { ActionRouter } from "../router/router"
import { ResolvedConfigGraph } from "../graph/config-graph"
import { relative, sep } from "path"
import { makeActionCompletePayload } from "../events/util"
import { ActionStatusPayload } from "../events/action-status-events"
import { BuildStatusForEventPayload } from "../plugin/handlers/Build/get-status"
import { DeployStatusForEventPayload } from "../types/service"
import { RunStatusForEventPayload } from "../plugin/plugin"

/**
 * Creates a corresponding Resolved version of the given Action, given the additional parameters needed.
 */
export function actionToResolved<T extends Action>(action: T, params: ResolveActionParams<T["_config"]>) {
  if (isBuildAction(action)) {
    return new ResolvedBuildAction({ ...action["params"], ...params })
  } else if (isDeployAction(action)) {
    return new ResolvedDeployAction({ ...action["params"], ...params })
  } else if (isRunAction(action)) {
    return new ResolvedRunAction({ ...action["params"], ...params })
  } else if (isTestAction(action)) {
    return new ResolvedTestAction({ ...action["params"], ...params })
  } else {
    return action satisfies never
  }
}

/**
 * Creates a corresponding Executed version of the given resolved Action, given the additional parameters needed.
 */
export function resolvedActionToExecuted<T extends ResolvedAction>(
  action: T,
  params: ExecuteActionParams<T["_config"]>
): Executed<T> {
  if (isBuildAction(action)) {
    return new ExecutedBuildAction({ ...action["params"], ...params }) as Executed<T>
  } else if (isDeployAction(action)) {
    return new ExecutedDeployAction({ ...action["params"], ...params }) as Executed<T>
  } else if (isRunAction(action)) {
    return new ExecutedRunAction({ ...action["params"], ...params }) as Executed<T>
  } else if (isTestAction(action)) {
    return new ExecutedTestAction({ ...action["params"], ...params }) as Executed<T>
  } else {
    return action satisfies never
  }
}

/**
 * Use this to validate any kind (Build, Deploy, Test etc.) of action config.
 */
export const actionConfigSchema = memoize(() =>
  joi.alternatives(
    buildActionConfigSchema(),
    deployActionConfigSchema(),
    runActionConfigSchema(),
    testActionConfigSchema()
  )
)

// TODO: maybe do this implicitly
export async function warnOnLinkedActions(garden: Garden, log: Log, actions: Action[]) {
  // Let the user know if any actions are linked to a local path
  const linkedSources = await getLinkedSources(garden, "project")

  const linkedActionsMsg = actions
    .filter((a) => a.isLinked(linkedSources))
    .map((a) => `${a.longDescription()} linked to path ${chalk.white(a.sourcePath())}`)
    .map((msg) => "  " + msg) // indent list

  if (linkedActionsMsg.length > 0) {
    log.info(renderDivider())
    log.info(chalk.gray(`The following actions are linked to a local path:\n${linkedActionsMsg.join("\n")}`))
    log.info(renderDivider())
  }
}

const displayStates = {
  failed: "in a failed state",
  unknown: "in an unknown state",
}

/**
 * Just to make action states look nicer in print.
 */
export function displayState(state: ActionState) {
  return displayStates[state] || state.replace("-", " ")
}

/**
 * Get the state of an Action
 */
export async function getActionState(
  action: Action,
  router: ActionRouter,
  graph: ResolvedConfigGraph,
  log: Log
): Promise<ActionState> {
  const actionLog = createActionLog({ log, actionName: action.name, actionKind: action.kind })
  switch (action.kind) {
    case "Build":
      return (await router.build.getStatus({ action: action as ResolvedBuildAction, log: actionLog, graph }))?.result
        ?.state

    case "Deploy":
      return (await router.deploy.getStatus({ action: action as ResolvedDeployAction, log: actionLog, graph }))?.result
        ?.state

    case "Run":
      return (await router.run.getResult({ action: action as ResolvedRunAction, log: actionLog, graph }))?.result?.state

    case "Test":
      return (await router.test.getResult({ action: action as ResolvedTestAction, log: actionLog, graph }))?.result
        ?.state
    default:
      return action satisfies never
  }
}

/**
 * Get action's config file path relative to garden project
 */
export function getRelativeActionConfigPath(projectRoot: string, action: Action): string {
  const relPath = relative(projectRoot, action.configPath() ?? "")
  return relPath.startsWith("..") ? relPath : "." + sep + relPath
}

export async function getDeployStatusPayloads({
  router,
  graph,
  log,
  sessionId,
}: {
  router: ActionRouter
  graph: ResolvedConfigGraph
  log: Log
  sessionId: string
}) {
  const actions = graph.getDeploys()

  return fromPairs(
    await Promise.all(
      actions.map(async (action) => {
        const startedAt = new Date().toISOString()
        const actionLog = createActionLog({ log, actionName: action.name, actionKind: action.kind })
        const { result } = await router.deploy.getStatus({ action, log: actionLog, graph })

        const payload = makeActionCompletePayload({
          result,
          operation: "getStatus",
          startedAt,
          force: false,
          action,
          sessionId,
        }) as ActionStatusPayload<DeployStatusForEventPayload>

        return [action.name, payload]
      })
    )
  )
}

export async function getBuildStatusPayloads({
  router,
  graph,
  log,
  sessionId,
}: {
  router: ActionRouter
  graph: ResolvedConfigGraph
  log: Log
  sessionId: string
}) {
  const actions = graph.getBuilds()

  return fromPairs(
    await Promise.all(
      actions.map(async (action) => {
        const startedAt = new Date().toISOString()
        const actionLog = createActionLog({ log, actionName: action.name, actionKind: action.kind })
        const { result } = await router.build.getStatus({ action, log: actionLog, graph })

        const payload = makeActionCompletePayload({
          result,
          operation: "getStatus",
          startedAt,
          force: false,
          action,
          sessionId,
        }) as ActionStatusPayload<BuildStatusForEventPayload>

        return [action.name, payload]
      })
    )
  )
}

export async function getTestStatusPayloads({
  router,
  graph,
  log,
  sessionId,
}: {
  router: ActionRouter
  graph: ResolvedConfigGraph
  log: Log
  sessionId: string
}) {
  const actions = graph.getTests()

  return fromPairs(
    await Promise.all(
      actions.map(async (action) => {
        const actionLog = createActionLog({ log, actionName: action.name, actionKind: action.kind })
        const startedAt = new Date().toISOString()
        const { result } = await router.test.getResult({ action, log: actionLog, graph })
        const payload = makeActionCompletePayload({
          result,
          operation: "getStatus",
          startedAt,
          force: false,
          action,
          sessionId,
        }) as ActionStatusPayload<RunStatusForEventPayload>
        return [action.name, payload]
      })
    )
  )
}

export async function getRunStatusPayloads({
  router,
  graph,
  log,
  sessionId,
}: {
  router: ActionRouter
  graph: ResolvedConfigGraph
  log: Log
  sessionId: string
}) {
  const actions = graph.getRuns()

  return fromPairs(
    await Promise.all(
      actions.map(async (action) => {
        const actionLog = createActionLog({ log, actionName: action.name, actionKind: action.kind })
        const startedAt = new Date().toISOString()
        const { result } = await router.run.getResult({ action, log: actionLog, graph })

        const payload = makeActionCompletePayload({
          result,
          operation: "getStatus",
          startedAt,
          force: false,
          action,
          sessionId,
        }) as ActionStatusPayload<RunStatusForEventPayload>

        return [action.name, payload]
      })
    )
  )
}
