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
import { Task } from "./tasks/base"
import { TaskResults } from "./task-graph"
import { FSWatcher } from "./watch"
import { padEnd, values } from "lodash"
import { registerCleanupFunction } from "./util/util"
import { PluginContext } from "./plugin-context"
import { toGardenError } from "./exceptions"
import { isModuleLinked } from "./util/ext-source-util"
import { Garden } from "./garden"

export type ProcessModule = (module: Module) => Promise<Task[]>

export interface ProcessModulesParams {
  modules: Module[]
  ctx: PluginContext
  garden: Garden,
  watch: boolean
  process: ProcessModule
  processWatchChange?: ProcessModule // Not required if watch is always false at the call site.
}

export interface ProcessServicesParams {
  services: Service[]
  ctx: PluginContext
  garden: Garden
  watch: boolean
  process: ProcessModule
  processWatchChange?: ProcessModule  // Not required if watch is always false at the call site.
}

export interface ProcessResults {
  taskResults: TaskResults
  restartRequired?: boolean
}

export async function processServices(
  { ctx, garden, services, watch, process, processWatchChange }:ProcessServicesParams,
): Promise<ProcessResults> {

  const modules = Array.from(new Set(services.map(s => s.module)))

  return processModules({
    modules,
    ctx,
    garden,
    watch,
    process,
    processWatchChange,
  })

}

export async function processModules(
  { ctx, garden, modules, watch, process, processWatchChange }: ProcessModulesParams,
): Promise<ProcessResults> {
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
    await Bluebird.map(tasks, t => garden.addTask(t))
  }

  for (const module of linkedModules) {
    ctx.log.info(
      chalk.gray(`Reading module ${chalk.cyan(module.name)} from linked local path ${chalk.white(module.path)}`),
    )
  }

  const results = await garden.processTasks()
  logErrors(results)

  if (!watch) {
    return {
      taskResults: results,
      restartRequired: false,
    }
  }

  const watcher = new FSWatcher(ctx)

  const restartPromise = new Promise(async (resolve) => {
    // TODO: should the prefix here be different or set explicitly per run?
    await watcher.watchModules(modules,
      async (changedModule: Module | null, configChanged: boolean) => {

        if (changedModule) {
          ctx.log.debug({ msg: `Files changed for module ${changedModule.name}` })
        }
        const restartNeeded = await handleChanges(ctx, garden, processWatchChange!, changedModule, configChanged)

        if (restartNeeded) {
          resolve()
        }

        logErrors(await garden.processTasks())
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
async function handleChanges(
  ctx: PluginContext,
  garden: Garden,
  processWatchChange: ProcessModule,
  module: Module | null,
  configChanged: boolean,
): Promise<boolean> {

  if (configChanged) {
    ctx.log.debug({ msg: `Config changed, reloading.` })
    return true
  }

  if (!module) {
    return false
  }

  await Bluebird.map(processWatchChange(module), task => {
    garden.addTask(task)
  })

  return false
}
