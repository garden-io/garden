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

export async function getDependantTasksForModule({
  garden,
  log,
  graph,
  module,
  hotReloadServiceNames,
  force = false,
  forceBuild = false,
  fromWatch = false,
  includeDependants = false,
}: {
  garden: Garden
  log: LogEntry
  graph: ConfigGraph
  module: Module
  hotReloadServiceNames: string[]
  force?: boolean
  forceBuild?: boolean
  fromWatch?: boolean
  includeDependants?: boolean
}): Promise<BaseTask[]> {
  let buildTasks: BaseTask[] = []
  let dependantBuildModules: Module[] = []
  let services: Service[] = []

  if (!includeDependants) {
    buildTasks.push(
      ...(await BuildTask.factory({
        garden,
        log,
        module,
        force: forceBuild,
        fromWatch,
        hotReloadServiceNames,
      }))
    )
    services = await graph.getServices(module.serviceNames)
  } else {
    const hotReloadModuleNames = await getModuleNames(graph, hotReloadServiceNames)

    const dependantFilterFn = (dependantNode: DependencyGraphNode) =>
      !hotReloadModuleNames.includes(dependantNode.moduleName)

    if (intersection(module.serviceNames, hotReloadServiceNames).length) {
      // Hot reloading is enabled for one or more of module's services.
      const serviceDeps = await graph.getDependantsForMany("deploy", module.serviceNames, true, dependantFilterFn)

      dependantBuildModules = serviceDeps.build
      services = serviceDeps.deploy
    } else {
      const dependants = await graph.getDependantsForModule(module, dependantFilterFn)

      buildTasks.push(
        ...(await BuildTask.factory({
          garden,
          log,
          module,
          force: true,
          fromWatch,
          hotReloadServiceNames,
        }))
      )
      dependantBuildModules = dependants.build
      services = (await graph.getServices(module.serviceNames)).concat(dependants.deploy)
    }
  }

  const dependantBuildTasks = flatten(
    await Bluebird.map(dependantBuildModules, (m) =>
      BuildTask.factory({
        garden,
        log,
        module: m,
        force: forceBuild,
        fromWatch,
        hotReloadServiceNames,
      })
    )
  )

  const deployTasks = services.map(
    (service) =>
      new DeployTask({
        garden,
        log,
        graph,
        service,
        force,
        forceBuild,
        fromWatch,
        hotReloadServiceNames,
      })
  )

  const outputTasks = [...buildTasks, ...dependantBuildTasks, ...deployTasks]
  log.silly(`getDependantTasksForModule called for module ${module.name}, returning the following tasks:`)
  log.silly(`  ${outputTasks.map((t) => t.getKey()).join(", ")}`)

  return outputTasks
}

async function getModuleNames(dg: ConfigGraph, hotReloadServiceNames: string[]) {
  const services = await dg.getServices(hotReloadServiceNames)
  return uniq(services.map((s) => s.module.name))
}

export function makeTestTaskName(moduleName: string, testConfigName: string) {
  return `${moduleName}.${testConfigName}`
}
