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
import { dedent } from "./util/string"
import { ConfigurationError } from "./exceptions"

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

    garden.events.on("projectConfigChanged", async () => {
      if (await validateConfigChange(garden, log, garden.projectRoot, "changed")) {
        log.info({ symbol: "info", msg: `Project configuration changed, reloading...` })
        resolve()
      }
    })

    garden.events.on("configAdded", async (event) => {
      if (await validateConfigChange(garden, log, event.path, "added")) {
        log.info({ symbol: "info", msg: `Garden config added at ${event.path}, reloading...` })
        resolve()
      }
    })

    garden.events.on("configRemoved", async (event) => {
      if (await validateConfigChange(garden, log, event.path, "removed")) {
        log.info({ symbol: "info", msg: `Garden config at ${event.path} removed, reloading...` })
        resolve()
      }
    })

    garden.events.on("moduleConfigChanged", async (event) => {
      if (await validateConfigChange(garden, log, event.path, "changed")) {
        const moduleNames = event.names
        const section = moduleNames.length === 1 ? moduleNames[0] : undefined
        log.info({ symbol: "info", section, msg: `Module configuration changed, reloading...` })
        resolve()
      }
    })

    garden.events.on("moduleSourcesChanged", async (event) => {
      graph = await garden.getConfigGraph()
      const changedModuleNames = event.names.filter((moduleName) => !!modulesByName[moduleName])

      if (changedModuleNames.length === 0) {
        return
      }

      // Make sure the modules' versions are up to date.
      const changedModules = await graph.getModules(changedModuleNames)

      await Bluebird.map(changedModules, async (m) => {
        modulesByName[m.name] = m
        return Bluebird.map(changeHandler!(graph, m), (task) => garden.addTask(task))
      })
      await garden.processTasks()
    })
  })

  // Start HTTP API and dashboard server.
  // allow overriding automatic port picking
  const port = Number(process.env.GARDEN_SERVER_PORT) || undefined
  await startServer(garden, log, port)

  await restartPromise

  return {
    taskResults: {}, // TODO: Return latest results for each task baseKey processed between restarts?
    restartRequired: true,
  }

}

/**
 * When config files change / are added / are removed, we try initializing a new Garden instance
 * with the changed config files and performing a bit of validation on it before proceeding with
 * a restart. If a config error was encountered, we simply log the error and keep the existing
 * Garden instance.
 *
 * Returns true if no configuration errors occurred.
 */
async function validateConfigChange(
  garden: Garden, log: LogEntry, changedPath: string, operationType: "added" | "changed" | "removed",
): Promise<boolean> {

  try {
    const nextGarden = await Garden.factory(garden.projectRoot, garden.opts)
    await nextGarden.getConfigGraph()
  } catch (error) {
    if (error instanceof ConfigurationError) {
      const msg = dedent`
        Encountered configuration error after ${changedPath} was ${operationType}:

        ${error.message}

        Keeping existing configuration and skipping restart.`
      log.error({ symbol: "error", msg, error })
      return false
    } else {
      throw error
    }
  }
  return true
}
