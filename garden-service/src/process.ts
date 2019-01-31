/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird = require("bluebird")
import chalk from "chalk"
import { padEnd, keyBy } from "lodash"

import { Module } from "./types/module"
import { Service } from "./types/service"
import { BaseTask } from "./tasks/base"
import { TaskResults } from "./task-graph"
import { isModuleLinked } from "./util/ext-source-util"
import { Garden } from "./garden"
import { LogEntry } from "./logger/log-entry"
import { startServer } from "./server/server"
import { ConfigGraph } from "./config-graph"

export type ProcessHandler = (graph: ConfigGraph, module: Module) => Promise<BaseTask[]>

interface ProcessParams {
  garden: Garden
  graph: ConfigGraph
  log: LogEntry
  logFooter?: LogEntry
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
  { garden, graph, log, logFooter, services, watch, handler, changeHandler }: ProcessServicesParams,
): Promise<ProcessResults> {

  const modules = Array.from(new Set(services.map(s => s.module)))

  return processModules({
    modules,
    garden,
    graph,
    log,
    logFooter,
    watch,
    handler,
    changeHandler,
  })
}

export async function processModules(
  { garden, graph, log, logFooter, modules, watch, handler, changeHandler }: ProcessModulesParams,
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
    const tasks = await handler(graph, module)
    await Bluebird.map(tasks, t => garden.addTask(t))
  }

  if (watch && !!logFooter) {
    garden.events.on("taskGraphProcessing", () => {
      logFooter.setState({ emoji: "hourglass_flowing_sand", msg: "Processing..." })
    })

    garden.events.on("taskGraphComplete", () => {
      logFooter.setState({ emoji: "clock2", msg: chalk.gray("Waiting for code changes") })
    })
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

  const modulesByName = keyBy(modules, "name")

  await garden.startWatcher(graph)

  const restartPromise = new Promise((resolve) => {
    garden.events.on("_restart", () => {
      log.debug({ symbol: "info", msg: `Manual restart triggered` })
      resolve()
    })

    garden.events.on("projectConfigChanged", () => {
      log.info({ symbol: "info", msg: `Project configuration changed, reloading...` })
      resolve()
    })

    garden.events.on("configAdded", (event) => {
      log.info({ symbol: "info", msg: `Garden config added at ${event.path}, reloading...` })
      resolve()
    })

    garden.events.on("moduleConfigChanged", (event) => {
      log.info({ symbol: "info", section: event.name, msg: `Module configuration changed, reloading...` })
      resolve()
    })

    garden.events.on("moduleSourcesChanged", async (event) => {
      const changedModule = modulesByName[event.name]

      if (!changedModule) {
        return
      }

      // Update the config graph
      graph = await garden.getConfigGraph()

      await Bluebird.map(changeHandler!(graph, changedModule), (task) => garden.addTask(task))
      await garden.processTasks()
    })
  })

  // Experimental HTTP API and dashboard server.
  if (process.env.GARDEN_ENABLE_SERVER === "1") {
    // allow overriding automatic port picking
    const port = Number(process.env.GARDEN_SERVER_PORT) || undefined
    await startServer(garden, log, port)
  }

  await restartPromise

  return {
    taskResults: {}, // TODO: Return latest results for each task baseKey processed between restarts?
    restartRequired: true,
  }

}
