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
import { GardenModule } from "../types/module"
import { ConfigGraph } from "../graph/config-graph"
import { LogEntry } from "../logger/log-entry"
import { BaseActionTask, BaseTask } from "./base"
import { TestTask } from "./test"
import { RunTask } from "./task"
import { GetServiceStatusTask } from "./get-service-status"
import { GetTaskResultTask } from "./get-task-result"
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

  log.silly(`getActionWatchTasks called for action ${action.description()}, returning the following tasks:`)
  log.silly(`  ${outputTasks.map((t) => t.getKey()).join(", ")}`)

  const deduplicated = uniqBy(outputTasks, (t) => t.getKey())

  return deduplicated
}

type RuntimeTask = DeployTask | TestTask

export function getServiceStatusDeps(task: RuntimeTask, deps: DependencyRelations): GetServiceStatusTask[] {
  return deps.deploy.map((service) => {
    return new GetServiceStatusTask({
      garden: task.garden,
      graph: task.graph,
      log: task.log,
      service,
      force: false,
      devModeDeployNames: task.devModeDeployNames,
      localModeDeployNames: task.localModeDeployNames,
    })
  })
}

export function getTaskResultDeps(task: RuntimeTask, deps: DependencyRelations): GetTaskResultTask[] {
  return deps.run.map((dep) => {
    return new GetTaskResultTask({
      garden: task.garden,
      graph: task.graph,
      log: task.log,
      task: dep,
      force: false,
    })
  })
}

export function getTaskDeps(task: RuntimeTask, deps: DependencyRelations, force: boolean): RunTask[] {
  return deps.run.map((dep) => {
    return new RunTask({
      task: dep,
      garden: task.garden,
      log: task.log,
      graph: task.graph,
      force,
      forceBuild: task.forceBuild,
      devModeDeployNames: task.devModeDeployNames,
      localModeDeployNames: task.localModeDeployNames,
    })
  })
}

export function getDeployDeps(task: RuntimeTask, deps: DependencyRelations, force: boolean): DeployTask[] {
  return deps.deploy.map(
    (service) =>
      new DeployTask({
        garden: task.garden,
        graph: task.graph,
        log: task.log,
        service,
        force,
        forceBuild: task.forceBuild,
        skipRuntimeDependencies: task.skipRuntimeDependencies,
        devModeDeployNames: task.devModeDeployNames,
        localModeDeployNames: task.localModeDeployNames,
      })
  )
}
