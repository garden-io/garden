/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { flatten, intersection } from "lodash"
import { DeployTask } from "./deploy"
import { BuildTask } from "./build"
import { TaskTask } from "./task"
import { Garden } from "../garden"
import { Module } from "../types/module"
import { Service } from "../types/service"
import { Task } from "../types/task"
import { DependencyGraphNode } from "../dependency-graph"
import { LogEntry } from "../logger/log-entry"

export async function getTasksForModule(
  { garden, log, module, hotReloadServiceNames, force = false, forceBuild = false,
    fromWatch = false, includeDependants = false }:
    {
      garden: Garden, log: LogEntry, module: Module, hotReloadServiceNames: string[], force?: boolean,
      forceBuild?: boolean, fromWatch?: boolean, includeDependants?: boolean,
    },
) {

  let buildTasks: BuildTask[] = []
  let dependantBuildModules: Module[] = []
  let services: Service[] = []
  let tasks: Task[] = []

  if (!includeDependants) {
    buildTasks.push(new BuildTask({ garden, log, module, force: true, fromWatch, hotReloadServiceNames }))
    services = module.services
    tasks = module.tasks
  } else {
    const hotReloadModuleNames = await getHotReloadModuleNames(garden, hotReloadServiceNames)
    const dg = await garden.getDependencyGraph()

    const dependantFilterFn = (dependantNode: DependencyGraphNode) => {
      return !hotReloadModuleNames.has(dependantNode.moduleName)
    }

    if (intersection(module.serviceNames, hotReloadServiceNames).length) {
      // Hot reloading is enabled for one or more of module's services.
      const serviceDeps = await dg.getDependantsForMany("service", module.serviceNames, true, dependantFilterFn)

      dependantBuildModules = serviceDeps.build
      services = serviceDeps.service
      tasks = serviceDeps.task
    } else {
      const dependants = await dg.getDependantsForModule(module, dependantFilterFn)
      buildTasks.push(new BuildTask({ garden, log, module, force: true, fromWatch, hotReloadServiceNames }))
      dependantBuildModules = dependants.build
      services = module.services.concat(dependants.service)
      tasks = module.tasks.concat(dependants.task)
    }
  }

  buildTasks.push(...dependantBuildModules
    .map(m => new BuildTask({ garden, log, module: m, force: forceBuild, fromWatch, hotReloadServiceNames })))

  const deployTasks = services
    .map(service => new DeployTask({ garden, log, service, force, forceBuild, fromWatch, hotReloadServiceNames }))

  const taskTasks = tasks
    .map(task => new TaskTask({ garden, log, task, force, forceBuild }))

  const outputTasks = [...buildTasks, ...deployTasks, ...taskTasks]
  log.silly(`getTasksForModule called for module ${module.name}, returning the following tasks:`)
  log.silly(`  ${outputTasks.map(t => t.getBaseKey()).join(", ")}`)

  return outputTasks
}

export async function getHotReloadModuleNames(garden: Garden, hotReloadServiceNames: string[]): Promise<Set<string>> {
  return new Set(flatten((await garden.getServices(hotReloadServiceNames || []))
    .map(s => s.module.name)))
}
