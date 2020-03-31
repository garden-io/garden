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

  const dependants = graph.getDependantsForModule(module, true)

  const dependantSourceModules = dependants.build.filter((depModule) =>
    depModule.serviceConfigs.find((s) => s.sourceModuleName === module.name)
  )

  const dependantSourceModuleServiceNames = flatten(
    dependantSourceModules.map((depModule) => {
      return depModule.serviceConfigs.filter((s) => s.sourceModuleName === module.name).map((s) => s.name)
    })
  )

  const serviceNamesForModule = [...module.serviceNames, ...dependantSourceModuleServiceNames]

  /**
   * If a service is deployed with hot reloading enabled, we don't rebuild its module
   * (or its sourceModule, if the service instead uses a sourceModule) when its
   * sources change.
   *
   * Therefore, we skip adding a build task for module if one of its services is in
   * hotReloadServiceNames, or if one of its build dependants' services is in
   * hotReloadServiceNames and has module as its sourceModule (in which case we
   * also don't add a build task for the dependant's module below).
   */
  if (intersection(serviceNamesForModule, hotReloadServiceNames).length === 0) {
    buildTasks = await BuildTask.factory({
      garden,
      graph,
      log,
      module,
      force: true,
    })
  }

  const dependantSourceModuleNames = dependantSourceModules.map((m) => m.name)

  const dependantBuildTasks = flatten(
    await Bluebird.map(
      dependants.build.filter((m) => !m.disabled && !dependantSourceModuleNames.includes(m.name)),
      (m) =>
        BuildTask.factory({
          garden,
          graph,
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

  const hotReloadServices = graph.getServices({ names: hotReloadServiceNames, includeDisabled: true })
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
