/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { mapKeys, mapValues, pickBy, omit } from "lodash"
import type { BaseActionTaskParams, ExecuteTask } from "./base"
import type { Action } from "../actions/types"
import { isDeployAction } from "../actions/deploy"
import { isTestAction } from "../actions/test"
import { isBuildAction } from "../actions/build"
import { isRunAction } from "../actions/run"
import { InternalError } from "../exceptions"
import type { GraphResults } from "../graph/results"
import type { DeployStatus } from "../plugin/handlers/Deploy/get-status"
import { splitLast } from "../util/string"
import type { ResolveActionTask } from "./resolve-action"

// NOTE: This is necessary to avoid circular imports.
// TODO: There may be better solutions
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
    throw new InternalError({ message: `Unexpected action kind` })
  }
}

export function getDeployStatuses(dependencyResults: GraphResults): { [name: string]: DeployStatus } {
  const deployResults = pickBy(dependencyResults.getMap(), (r) => r && r.type === "deploy")
  const statuses = mapValues(deployResults, (r) => omit(r!.result, "version") as DeployStatus)
  return mapKeys(statuses, (_, key) => splitLast(key, ".")[1])
}
