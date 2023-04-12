/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { memoize } from "lodash"
import { joi } from "../config/common"
import { Log } from "../logger/log-entry"
import { renderDivider } from "../logger/util"
import { buildActionConfigSchema, ExecutedBuildAction, isBuildAction, ResolvedBuildAction } from "./build"
import { deployActionConfigSchema, ExecutedDeployAction, isDeployAction, ResolvedDeployAction } from "./deploy"
import { ExecutedRunAction, isRunAction, ResolvedRunAction, runActionConfigSchema } from "./run"
import { ExecutedTestAction, isTestAction, ResolvedTestAction, testActionConfigSchema } from "./test"
import type { Action, ActionState, ExecuteActionParams, Executed, ResolveActionParams, ResolvedAction } from "./types"

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
    const _exhaustiveCheck: never = action
    return _exhaustiveCheck
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
    const _exhaustiveCheck: never = action
    return _exhaustiveCheck
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
export function warnOnLinkedActions(log: Log, actions: Action[]) {
  // Let the user know if any actions are linked to a local path
  const linkedActionsMsg = actions
    .filter((a) => a.isLinked())
    .map((a) => `${a.longDescription()} linked to path ${chalk.white(a.basePath())}`)
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
