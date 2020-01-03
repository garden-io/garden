/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { intersection, uniq, flatten } from "lodash"
import { DeployTask } from "./deploy"
import { Garden } from "../garden"
import { Module } from "../types/module"
import { Service } from "../types/service"
import { DependencyGraphNode, ConfigGraph } from "../config-graph"
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
  serviceNames,
  hotReloadServiceNames,
}: {
  garden: Garden
  log: LogEntry
  graph: ConfigGraph
  module: Module
  serviceNames: string[]
  hotReloadServiceNames: string[]
}): Promise<BaseTask[]> {
  let buildTasks: BaseTask[] = []
  let dependantBuildModules: Module[] = []
  let servicesToDeploy: Service[] = []

  const hotReloadModuleNames = await getModuleNames(graph, hotReloadServiceNames)

  const dependantFilterFn = (dependantNode: DependencyGraphNode) =>
    !hotReloadModuleNames.includes(dependantNode.moduleName)

  if (intersection(module.serviceNames, hotReloadServiceNames).length) {
    // Hot reloading is enabled for one or more of module's services.
    const serviceDeps = await graph.getDependantsForMany({
      nodeType: "deploy",
      names: module.serviceNames,
      recursive: true,
      filterFn: dependantFilterFn,
    })

    dependantBuildModules = serviceDeps.build
    servicesToDeploy = serviceDeps.deploy
  } else {
    const dependants = await graph.getDependantsForModule(module, dependantFilterFn)

    buildTasks = await BuildTask.factory({
      garden,
      log,
      module,
      force: true,
    })

    dependantBuildModules = dependants.build
    servicesToDeploy = (await graph.getServices({ names: serviceNames })).concat(dependants.deploy)
  }

  const dependantBuildTasks = flatten(
    await Bluebird.map(dependantBuildModules, (m) =>
      BuildTask.factory({
        garden,
        log,
        module: m,
        force: false,
      })
    )
  )

  const deployTasks = servicesToDeploy.map(
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

  const hotReloadServices = await graph.getServices({ names: hotReloadServiceNames })
  const hotReloadTasks = hotReloadServices
    .filter((service) => service.module.name === module.name || service.sourceModule.name === module.name)
    .map((service) => new HotReloadTask({ garden, graph, log, service, force: true }))

  const outputTasks = [...buildTasks, ...dependantBuildTasks, ...deployTasks, ...hotReloadTasks]

  log.silly(`getModuleWatchTasks called for module ${module.name}, returning the following tasks:`)
  log.silly(`  ${outputTasks.map((t) => t.getKey()).join(", ")}`)

  return outputTasks
}

async function getModuleNames(dg: ConfigGraph, hotReloadServiceNames: string[]) {
  const services = await dg.getServices({ names: hotReloadServiceNames })
  return uniq(services.map((s) => s.module.name))
}

export function makeTestTaskName(moduleName: string, testConfigName: string) {
  return `${moduleName}.${testConfigName}`
}
