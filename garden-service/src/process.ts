/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird = require("bluebird")
import chalk from "chalk"
import { padEnd } from "lodash"

import { Module } from "./types/module"
import { Service } from "./types/service"
import { BaseTask } from "./tasks/base"
import { TaskResults } from "./task-graph"
import { FSWatcher } from "./watch"
import { registerCleanupFunction } from "./util/util"
import { isModuleLinked } from "./util/ext-source-util"
import { Garden } from "./garden"
import { LogEntry } from "./logger/log-entry"
import { startServer } from "./server/server"

export type ProcessHandler = (module: Module) => Promise<BaseTask[]>

interface ProcessParams {
  garden: Garden
  log: LogEntry
  watch: boolean
  handler: ProcessHandler
  // use this if the behavior should be different on watcher changes than on initial processing
  changeHandler?: ProcessHandler
}

export interface ProcessModulesParams extends ProcessParams {
  modules: Module[]
}

export interface ProcessServicesParams extends ProcessParams {
  services: Service[]
}

export interface ProcessResults {
  taskResults: TaskResults
  restartRequired?: boolean
}

export async function processServices(
  { garden, log, services, watch, handler, changeHandler }: ProcessServicesParams,
): Promise<ProcessResults> {

  const modules = Array.from(new Set(services.map(s => s.module)))

  return processModules({
    modules,
    garden,
    log,
    watch,
    handler,
    changeHandler,
  })
}

export async function processModules(
  { garden, log, modules, watch, handler, changeHandler }: ProcessModulesParams,
): Promise<ProcessResults> {

  log.debug("Starting processModules")

  // Let the user know if any modules are linked to a local path
  const linkedModulesMsg = modules
    .filter(m => isModuleLinked(m, garden))
    .map(m => `${chalk.cyan(m.name)} linked to path ${chalk.white(m.path)}`)
    .map(msg => "  " + msg) // indent list

  if (linkedModulesMsg.length > 0) {
    const divider = padEnd("", 80, "—")
    log.info(divider)
    log.info(chalk.gray(`Following modules are linked to a local path:\n${linkedModulesMsg.join("\n")}`))
    log.info(divider)
  }

  for (const module of modules) {
    const tasks = await handler(module)
    await Bluebird.map(tasks, t => garden.addTask(t))
  }

  const results = await garden.processTasks()

  if (!watch) {
    return {
      taskResults: results,
      restartRequired: false,
    }
  }

  if (!changeHandler) {
    changeHandler = handler
  }

  const watcher = new FSWatcher(garden, log)

  const restartPromise = new Promise(async (resolve) => {
    await watcher.watchModules(modules,
      async (changedModule: Module | null, configChanged: boolean) => {
        if (configChanged) {
          log.debug({ msg: `Config changed, reloading.` })
          resolve()
          return
        }

        if (changedModule) {
          log.silly({ msg: `Files changed for module ${changedModule.name}` })

          await Bluebird.map(changeHandler!(changedModule), (task) => garden.addTask(task))
        }

        await garden.processTasks()
      })

    registerCleanupFunction("clearAutoReloadWatches", () => {
      watcher.close()
    })
  })

  // Experimental HTTP API and dashboard server.
  if (process.env.GARDEN_ENABLE_SERVER === "1") {
    await startServer(garden)
  }

  await restartPromise
  watcher.close()

  return {
    taskResults: {}, // TODO: Return latest results for each task baseKey processed between restarts?
    restartRequired: true,
  }

}
