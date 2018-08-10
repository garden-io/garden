/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird = require("bluebird")
import chalk from "chalk"
import { Module } from "./types/module"
import { Service } from "./types/service"
import { Task } from "./types/task"
import { TaskResults } from "./task-graph"
import {
  AutoReloadDependants,
  autoReloadModules,
  computeAutoReloadDependants,
  FSWatcher,
  withDependants,
} from "./watch"
import { padEnd, values, flatten } from "lodash"
import { getNames, registerCleanupFunction } from "./util/util"
import { PluginContext } from "./plugin-context"
import { toGardenError } from "./exceptions"
import { isModuleLinked } from "./util/ext-source-util"

export type ProcessModule = (module: Module) => Promise<Task[]>
export type ProcessService = (service: Service) => Promise<Task[]>

export interface ProcessModulesParams {
  pluginContext: PluginContext
  modules: Module[]
  watch: boolean
  process: ProcessModule
}

export interface ProcessServicesParams {
  pluginContext: PluginContext
  services: Service[]
  watch: boolean
  process: ProcessService
}

export interface ProcessResults {
  taskResults: TaskResults
  restartRequired?: boolean
}

export async function processServices({ pluginContext, services, watch, process }: ProcessServicesParams):
  Promise<ProcessResults> {

  const serviceNames = getNames(services)
  const modules = Array.from(new Set(services.map(s => s.module)))

  return processModules({
    pluginContext,
    modules,
    watch,
    process: async (module) => {
      const moduleServices = await module.getServices()
      const servicesToDeploy = moduleServices.filter(s => serviceNames.includes(s.name))
      return flatten(await Bluebird.map(servicesToDeploy, process))
    },
  })

}

export async function processModules({ pluginContext, modules, watch, process }: ProcessModulesParams):
  Promise<ProcessResults> {
  const ctx = pluginContext
  const linkedModules: Module[] = []

  // TODO: log errors as they happen, instead of after processing all tasks
  const logErrors = (taskResults: TaskResults) => {
    for (const result of values(taskResults).filter(r => !!r.error)) {
      const divider = padEnd("", 80, "—")
      const error = toGardenError(result.error!)
      const msg = `\nFailed ${result.description}. Here is the output:\n${divider}\n${error.message}\n${divider}\n`

      ctx.log.error({ msg, error })
    }
  }

  for (const module of modules) {
    const tasks = await process(module)
    if (isModuleLinked(module, ctx)) {
      linkedModules.push(module)
    }
    await Bluebird.map(tasks, ctx.addTask)
  }

  for (const module of linkedModules) {
    ctx.log.info(
      chalk.gray(`Reading module ${chalk.cyan(module.name)} from linked local path ${chalk.white(module.path)}`),
    )
  }

  const results = await ctx.processTasks()
  logErrors(results)

  if (!watch) {
    return {
      taskResults: results,
      restartRequired: false,
    }
  }

  const modulesToWatch = await autoReloadModules(modules)
  const autoReloadDependants = await computeAutoReloadDependants(ctx)

  const watcher = new FSWatcher(ctx)

  const restartPromise = new Promise(async (resolve) => {

    // TODO: should the prefix here be different or set explicitly per run?
    await watcher.watchModules(modulesToWatch,
      async (changedModule: Module | null, configChanged: boolean) => {

        if (changedModule) {
          ctx.log.debug({ msg: `Files changed for module ${changedModule.name}` })
        }
        const restartNeeded = await handleChanges(ctx, autoReloadDependants, process, changedModule, configChanged)

        if (restartNeeded) {
          resolve()
        }

        logErrors(await ctx.processTasks())

      })

    registerCleanupFunction("clearAutoReloadWatches", () => {
      watcher.close()
    })

  })

  await restartPromise
  watcher.close()

  return {
    taskResults: {}, // TODO: Return latest results for each task baseKey processed between restarts?
    restartRequired: true,
  }

}

// Returns true if the command that requested the watch needs to be restarted.
export async function handleChanges(
  pluginContext: PluginContext,
  autoReloadDependants: AutoReloadDependants,
  process: ProcessModule,
  module: Module | null,
  configChanged: boolean): Promise<boolean> {

  const ctx = pluginContext

  if (configChanged) {
    ctx.log.debug({ msg: `Config changed, reloading.` })
    return true
  }

  if (!module) {
    return false
  }

  for (const m of await withDependants([module], autoReloadDependants)) {
    await Bluebird.map(process(m), ctx.addTask)
  }

  return false

}
