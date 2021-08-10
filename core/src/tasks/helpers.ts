/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { uniqBy } from "lodash"
import { DeployTask } from "./deploy"
import { Garden } from "../garden"
import { GardenModule } from "../types/module"
import { ConfigGraph } from "../config-graph"
import { LogEntry } from "../logger/log-entry"
import { BaseTask } from "./base"
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
  servicesWatched,
  devModeServiceNames,
  hotReloadServiceNames,
}: {
  garden: Garden
  log: LogEntry
  graph: ConfigGraph
  module: GardenModule
  servicesWatched: string[]
  devModeServiceNames: string[]
  hotReloadServiceNames: string[]
}): Promise<BaseTask[]> {
  const dependants = graph.getDependantsForModule(module, true)

  const deployTasks = dependants.deploy
    .filter(
      (s) =>
        !s.disabled &&
        servicesWatched.includes(s.name) &&
        !devModeServiceNames.includes(s.name) &&
        !hotReloadServiceNames.includes(s.name)
    )
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
          devModeServiceNames,
          hotReloadServiceNames,
        })
    )

  const hotReloadServices = graph.getServices({ names: hotReloadServiceNames, includeDisabled: true })
  const hotReloadTasks = hotReloadServices
    .filter(
      (service) =>
        !service.disabled && (service.module.name === module.name || service.sourceModule.name === module.name)
    )
    .map((service) => new HotReloadTask({ garden, graph, log, service, force: true, hotReloadServiceNames }))

  const outputTasks = [...deployTasks, ...hotReloadTasks]

  log.silly(`getModuleWatchTasks called for module ${module.name}, returning the following tasks:`)
  log.silly(`  ${outputTasks.map((t) => t.getKey()).join(", ")}`)

  const deduplicated = uniqBy(outputTasks, (t) => t.getKey())

  return deduplicated
}

export function makeTestTaskName(moduleName: string, testConfigName: string) {
  return `${moduleName}.${testConfigName}`
}
