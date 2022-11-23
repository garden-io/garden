/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { mapKeys, mapValues, pickBy, uniqBy } from "lodash"
import type { Garden } from "../garden"
import type { ConfigGraph } from "../graph/config-graph"
import type { LogEntry } from "../logger/log-entry"
import type { BaseActionTaskParams, BaseTask, ExecuteTask } from "./base"
import type { Action } from "../actions/types"
import { isDeployAction } from "../actions/deploy"
import { isTestAction } from "../actions/test"
import { isBuildAction } from "../actions/build"
import { isRunAction } from "../actions/run"
import { InternalError } from "../exceptions"
import type { GraphResults } from "../graph/results"
import type { DeployStatus } from "../plugin/handlers/deploy/get-status"
import type { GetRunResult } from "../plugin/handlers/run/get-result"
import { splitLast } from "../util/util"
import type { ResolveActionTask } from "./resolve-action"

// NOTE: This is necessary to avoid circular imports.
// TODO-G2B: There may be better solutions
const importLazy = require("import-lazy")(require)
const build = importLazy("./build")
const deploy = importLazy("./deploy")
const run = importLazy("./run")
const test = importLazy("./test")
const resolve = importLazy("./resolve-action")

export function getResolveTaskForAction<T extends Action>(
  action: T,
  baseParams: Omit<BaseActionTaskParams, "action">
): ResolveActionTask<T> {
  return new resolve.ResolveActionTask({ ...baseParams, action })
}

export function getExecuteTaskForAction<T extends Action>(
  action: T,
  baseParams: Omit<BaseActionTaskParams, "action">
): ExecuteTask {
  if (isBuildAction(action)) {
    return new build.BuildTask({ ...baseParams, action })
  } else if (isDeployAction(action)) {
    return new deploy.DeployTask({ ...baseParams, action })
  } else if (isRunAction(action)) {
    return new run.RunTask({ ...baseParams, action })
  } else if (isTestAction(action)) {
    return new test.TestTask({ ...baseParams, action })
  } else {
    // Shouldn't happen
    throw new InternalError(`Unexpected action kind`, {})
  }
}

/**
 * Helper used by the `garden dev` and `garden deploy --watch` commands, to get all the tasks that should be
 * executed for those when a particular action changes.
 */
export async function getActionWatchTasks({
  garden,
  log,
  graph,
  updatedAction,
  deploysWatched,
  devModeDeployNames,
  localModeDeployNames,
  testsWatched,
}: {
  garden: Garden
  log: LogEntry
  graph: ConfigGraph
  updatedAction: Action
  deploysWatched: string[]
  devModeDeployNames: string[]
  localModeDeployNames: string[]
  testsWatched: string[]
}): Promise<BaseTask[]> {
  const dependants = graph.getDependants({ kind: updatedAction.kind, name: updatedAction.name, recursive: true })
  dependants.push(updatedAction)

  const outputTasks: BaseTask[] = []

  for (const a of dependants) {
    if (a.isDisabled()) {
      continue
    }
    const params = {
      garden,
      log,
      graph,
      force: true,
      forceBuild: false,
      fromWatch: true,
      devModeDeployNames,
      localModeDeployNames,
    }
    if (isTestAction(a) && testsWatched.includes(a.name)) {
      outputTasks.push(new test.TestTask({ ...params, action: a }))
    }
    if (isDeployAction(a) && deploysWatched.includes(a.name) && !devModeDeployNames.includes(a.name)) {
      outputTasks.push(new deploy.DeployTask({ ...params, action: a }))
    }
  }

  log.silly(`getActionWatchTasks called for ${updatedAction.longDescription()}, returning the following tasks:`)
  log.silly(`  ${outputTasks.map((t) => t.getBaseKey()).join(", ")}`)

  const deduplicated = uniqBy(outputTasks, (t) => t.getBaseKey())

  return deduplicated
}

export function getServiceStatuses(dependencyResults: GraphResults): { [name: string]: DeployStatus } {
  const deployResults = pickBy(dependencyResults.getMap(), (r) => r && r.type === "deploy")
  const statuses = mapValues(deployResults, (r) => r!.result as DeployStatus)
  return mapKeys(statuses, (_, key) => splitLast(key, ".")[1])
}

export function getRunResults(dependencyResults: GraphResults): { [name: string]: GetRunResult } {
  const runResults = pickBy(dependencyResults.getMap(), (r) => r && r.type === "run")
  const results = mapValues(runResults, (r) => r!.result as GetRunResult)
  return mapKeys(results, (_, key) => splitLast(key, ".")[1])
}
