/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { intersection, flatten, uniqBy } from "lodash"
import { DeployTask } from "./deploy"
import { Garden } from "../garden"
import { Module } from "../types/module"
import { ConfigGraph } from "../config-graph"
import { LogEntry } from "../logger/log-entry"
import { BaseTask } from "./base"
import { BuildTask } from "./build"
import { HotReloadTask } from "./hot-reload"

/**
 * Helper used by the `garden dev` and `garden deploy --watch` commands, to get all the tasks that should be
 * executed for those when a particular module changes.
 */
export async function getModuleWatchTasks({
  garden,
  log,
  graph,
  module,
  hotReloadServiceNames,
}: {
  garden: Garden
  log: LogEntry
  graph: ConfigGraph
  module: Module
  hotReloadServiceNames: string[]
}): Promise<BaseTask[]> {
  let buildTasks: BaseTask[] = []

  const dependants = await graph.getDependantsForModule(module, true)

  if (intersection(module.serviceNames, hotReloadServiceNames).length === 0) {
    buildTasks = await BuildTask.factory({
      garden,
      log,
      module,
      force: true,
    })
  }

  const dependantBuildTasks = flatten(
    await Bluebird.map(
      dependants.build.filter((m) => !m.disabled),
      (m) =>
        BuildTask.factory({
          garden,
          log,
          module: m,
          force: false,
        })
    )
  )

  const deployTasks = dependants.deploy
    .filter((s) => !s.disabled && !hotReloadServiceNames.includes(s.name))
    .map(
      (service) =>
        new DeployTask({
          garden,
          log,
          graph,
          service,
          force: true,
          forceBuild: false,
          fromWatch: true,
          hotReloadServiceNames,
        })
    )

  const hotReloadServices = await graph.getServices({ names: hotReloadServiceNames, includeDisabled: true })
  const hotReloadTasks = hotReloadServices
    .filter(
      (service) =>
        !service.disabled && (service.module.name === module.name || service.sourceModule.name === module.name)
    )
    .map((service) => new HotReloadTask({ garden, graph, log, service, force: true }))

  const outputTasks = [...buildTasks, ...dependantBuildTasks, ...deployTasks, ...hotReloadTasks]

  log.silly(`getModuleWatchTasks called for module ${module.name}, returning the following tasks:`)
  log.silly(`  ${outputTasks.map((t) => t.getKey()).join(", ")}`)

  return uniqBy(outputTasks, (t) => t.getKey())
}

export function makeTestTaskName(moduleName: string, testConfigName: string) {
  return `${moduleName}.${testConfigName}`
}
