/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { uniqBy } from "lodash"
import { DeployTask } from "./deploy"
import { Garden } from "../garden"
import { ConfigGraph } from "../graph/config-graph"
import { LogEntry } from "../logger/log-entry"
import { BaseTask } from "./base"
import { TestTask } from "./test"
import { Action } from "../actions/base"
import { isDeployAction } from "../actions/deploy"
import { isTestAction } from "../actions/test"

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
      outputTasks.push(new TestTask({ ...params, action: a }))
    }
    if (isDeployAction(a) && deploysWatched.includes(a.name) && !devModeDeployNames.includes(a.name)) {
      outputTasks.push(new DeployTask({ ...params, action: a }))
    }
  }

  log.silly(`getActionWatchTasks called for ${updatedAction.longDescription()}, returning the following tasks:`)
  log.silly(`  ${outputTasks.map((t) => t.getBaseKey()).join(", ")}`)

  const deduplicated = uniqBy(outputTasks, (t) => t.getBaseKey())

  return deduplicated
}
