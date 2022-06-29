/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import chalk from "chalk"
import { keyBy, flatten } from "lodash"

import { GardenModule } from "./types/module"
import { BaseTask } from "./tasks/base"
import { GraphResults } from "./task-graph"
import { isModuleLinked } from "./util/ext-source-util"
import { Garden } from "./garden"
import { EmojiName, LogEntry } from "./logger/log-entry"
import { ConfigGraph } from "./config-graph"
import { dedent, naturalList } from "./util/string"
import { ConfigurationError } from "./exceptions"
import { uniqByName } from "./util/util"
import { renderDivider } from "./logger/util"
import { Events } from "./events"
import { BuildTask } from "./tasks/build"
import { DeployTask } from "./tasks/deploy"
import { filterTestConfigs, TestTask } from "./tasks/test"
import { testFromConfig } from "./types/test"
import { TaskTask } from "./tasks/task"

export type ProcessHandler = (graph: ConfigGraph, module: GardenModule) => Promise<BaseTask[]>

interface ProcessParams {
  garden: Garden
  graph: ConfigGraph
  log: LogEntry
  footerLog?: LogEntry
  watch: boolean
  /**
   * If provided, and if `watch === true`, will log this to the statusline when waiting for changes
   */
  overRideWatchStatusLine?: string
  /**
   * If provided, and if `watch === true`, don't watch files in the module roots of these modules.
   */
  skipWatchModules?: GardenModule[]
  initialTasks: BaseTask[]
  /**
   * Use this if the behavior should be different on watcher changes than on initial processing
   */
  changeHandler: ProcessHandler
}

export interface ProcessModulesParams extends ProcessParams {
  modules: GardenModule[]
}

export interface ProcessResults {
  taskResults: GraphResults
  restartRequired?: boolean
}

let statusLine: LogEntry

export async function processModules({
  garden,
  graph,
  log,
  footerLog,
  modules,
  initialTasks,
  skipWatchModules,
  watch,
  changeHandler,
  overRideWatchStatusLine,
}: ProcessModulesParams): Promise<ProcessResults> {
  log.silly("Starting processModules")

  // Let the user know if any modules are linked to a local path
  const linkedModulesMsg = modules
    .filter((m) => isModuleLinked(m, garden))
    .map((m) => `${chalk.cyan(m.name)} linked to path ${chalk.white(m.path)}`)
    .map((msg) => "  " + msg) // indent list

  if (linkedModulesMsg.length > 0) {
    log.info(renderDivider())
    log.info(chalk.gray(`The following modules are linked to a local path:\n${linkedModulesMsg.join("\n")}`))
    log.info(renderDivider())
  }

  // true if one or more tasks failed when the task graph last finished processing all its nodes.
  let taskErrorDuringLastProcess = false

  if (watch && !!footerLog) {
    if (!statusLine) {
      statusLine = footerLog.info("").placeholder()
    }

    garden.events.on("taskGraphProcessing", () => {
      taskErrorDuringLastProcess = false
      statusLine.setState({ emoji: "hourglass_flowing_sand", msg: "Processing..." })
    })
  }

  const results = await garden.processTasks(initialTasks)

  if (!watch && !garden.persistent) {
    return {
      taskResults: results,
      restartRequired: false,
    }
  }

  if (!watch && garden.persistent) {
    // Garden process is persistent but not in watch mode. E.g. used to
    // keep port forwards alive without enabling watch or dev mode.
    await new Promise((resolve) => {
      garden.events.on("_restart", () => {
        log.debug({ symbol: "info", msg: `Manual restart triggered` })
        resolve({})
      })

      garden.events.on("_exit", () => {
        log.debug({ symbol: "info", msg: `Manual exit triggered` })
        restartRequired = false
        resolve({})
      })
    })
    return {
      taskResults: results,
      restartRequired: false,
    }
  }

  const deps = graph.getDependenciesForMany({
    nodeType: "build",
    names: modules.map((m) => m.name),
    recursive: true,
  })
  const modulesToWatch = uniqByName(deps.build.concat(modules))
  const modulesByName = keyBy(modulesToWatch, "name")

  await garden.startWatcher({ graph, skipModules: skipWatchModules })

  const taskError = () => {
    if (!!statusLine) {
      statusLine.setState({
        emoji: "heavy_exclamation_mark",
        msg: chalk.red("One or more actions failed, see the log output above for details."),
      })
    }
  }

  const waiting = () => {
    if (!!statusLine) {
      statusLine.setState({
        emoji: "clock2",
        msg: chalk.gray(overRideWatchStatusLine || "Waiting for code changes..."),
      })
    }

    garden.events.emit("watchingForChanges", {})
  }

  let restartRequired = true

  await new Promise((resolve) => {
    garden.events.on("taskError", () => {
      taskErrorDuringLastProcess = true
      taskError()
    })

    garden.events.on("taskGraphComplete", () => {
      if (!taskErrorDuringLastProcess) {
        waiting()
      }
    })

    garden.events.on("_restart", () => {
      log.debug({ symbol: "info", msg: `Manual restart triggered` })
      resolve({})
    })

    garden.events.on("_exit", () => {
      log.debug({ symbol: "info", msg: `Manual exit triggered` })
      restartRequired = false
      resolve({})
    })

    garden.events.on("projectConfigChanged", async () => {
      if (await validateConfigChange(garden, log, garden.projectRoot, "changed")) {
        log.info({
          symbol: "info",
          msg: `Project configuration changed, reloading...`,
        })
        resolve({})
      }
    })

    garden.events.on("configAdded", async (event) => {
      if (await validateConfigChange(garden, log, event.path, "added")) {
        log.info({
          symbol: "info",
          msg: `Garden config added at ${event.path}, reloading...`,
        })
        resolve({})
      }
    })

    garden.events.on("configRemoved", async (event) => {
      if (await validateConfigChange(garden, log, event.path, "removed")) {
        log.info({
          symbol: "info",
          msg: `Garden config at ${event.path} removed, reloading...`,
        })
        resolve({})
      }
    })

    garden.events.on("moduleConfigChanged", async (event) => {
      if (await validateConfigChange(garden, log, event.path, "changed")) {
        const moduleNames = event.names
        const section = moduleNames.length === 1 ? moduleNames[0] : undefined
        log.info({
          symbol: "info",
          section,
          msg: `Module configuration changed, reloading...`,
        })
        resolve({})
      }
    })

    garden.events.on("moduleSourcesChanged", async (event) => {
      graph = await garden.getConfigGraph({ log, emit: false })
      const changedModuleNames = event.names.filter((moduleName) => !!modulesByName[moduleName])

      if (changedModuleNames.length === 0) {
        return
      }

      // Make sure the modules' versions are up to date.
      const changedModules = graph.getModules({ names: changedModuleNames })

      const moduleTasks = flatten(
        await Bluebird.map(changedModules, async (m) => {
          modulesByName[m.name] = m
          return changeHandler!(graph, m)
        })
      )
      await garden.processTasks(moduleTasks)
    })

    garden.events.on("buildRequested", async (event: Events["buildRequested"]) => {
      log.info("")
      log.info({
        emoji: "hammer",
        msg: chalk.white(`Build requested for ${chalk.italic(chalk.cyan(event.moduleName))}`),
      })

      try {
        garden.clearCaches()
        graph = await garden.getConfigGraph({ log, emit: false })
        const tasks = await cloudEventHandlers.buildRequested({ log, request: event, graph, garden })
        await garden.processTasks(tasks)
      } catch (err) {
        log.error(err.message)
      }
    })
    garden.events.on("deployRequested", async (event: Events["deployRequested"]) => {
      let prefix: string
      let emoji: EmojiName
      if (event.hotReload) {
        emoji = "fire"
        prefix = `Hot reload-enabled deployment`
      } else {
        // local mode always takes precedence over dev mode
        if (event.localMode) {
          emoji = "left_right_arrow"
          prefix = `Local-mode deployment`
        } else if (event.devMode) {
          emoji = "zap"
          prefix = `Dev-mode deployment`
        } else {
          emoji = "rocket"
          prefix = "Deployment"
        }
      }
      const msg = `${prefix} requested for ${chalk.italic(chalk.cyan(event.serviceName))}`
      log.info("")
      log.info({ emoji, msg: chalk.white(msg) })

      try {
        garden.clearCaches()
        graph = await garden.getConfigGraph({ log, emit: false })
        const deployTask = await cloudEventHandlers.deployRequested({ log, request: event, graph, garden })
        await garden.processTasks([deployTask])
      } catch (err) {
        log.error(err.message)
      }
    })
    garden.events.on("testRequested", async (event: Events["testRequested"]) => {
      const testNames = event.testNames
      let suffix = ""
      if (testNames) {
        suffix = ` (only ${chalk.italic(chalk.cyan(naturalList(testNames)))})`
      }
      const msg = chalk.white(`Tests requested for ${chalk.italic(chalk.cyan(event.moduleName))}${suffix}`)
      log.info("")
      log.info({ emoji: "thermometer", msg })

      try {
        garden.clearCaches()
        graph = await garden.getConfigGraph({ log, emit: false })
        const testTasks = await cloudEventHandlers.testRequested({ log, request: event, graph, garden })
        await garden.processTasks(testTasks)
      } catch (err) {
        log.error(err.message)
      }
    })
    garden.events.on("taskRequested", async (event: Events["taskRequested"]) => {
      const msg = chalk.white(`Run requested for task ${chalk.italic(chalk.cyan(event.taskName))}`)
      log.info("")
      log.info({ emoji: "runner", msg })

      try {
        garden.clearCaches()
        graph = await garden.getConfigGraph({ log, emit: false })
        const taskTask = await cloudEventHandlers.taskRequested({ log, request: event, graph, garden })
        await garden.processTasks([taskTask])
      } catch (err) {
        log.error(err.message)
      }
    })

    waiting()
  })

  return {
    taskResults: {}, // TODO: Return latest results for each task key processed between restarts?
    restartRequired,
  }
}

export interface CloudEventHandlerCommonParams {
  garden: Garden
  graph: ConfigGraph
  log: LogEntry
}

/*
 * TODO: initialize devModeServiceNames/hotReloadServiceNames/localModeServiceNames
 *       depending on the corresponding deployment flags. See class DeployCommand for details.
 */
export const cloudEventHandlers = {
  buildRequested: async (params: CloudEventHandlerCommonParams & { request: Events["buildRequested"] }) => {
    const { garden, graph, log } = params
    const { moduleName, force } = params.request
    const tasks = await BuildTask.factory({
      garden,
      log,
      graph,
      module: graph.getModule(moduleName),
      force,
    })
    return tasks
  },
  testRequested: async (params: CloudEventHandlerCommonParams & { request: Events["testRequested"] }) => {
    const { garden, graph, log } = params
    const { moduleName, testNames, force, forceBuild } = params.request
    const module = graph.getModule(moduleName)
    return filterTestConfigs(module.testConfigs, testNames).map((config) => {
      return new TestTask({
        garden,
        graph,
        log,
        force,
        forceBuild,
        test: testFromConfig(module, config, graph),
        skipRuntimeDependencies: params.request.skipDependencies,
        devModeServiceNames: [],
        hotReloadServiceNames: [],
        localModeServiceNames: [],
      })
    })
  },
  deployRequested: async (params: CloudEventHandlerCommonParams & { request: Events["deployRequested"] }) => {
    const { garden, graph, log } = params
    const { serviceName, force, forceBuild } = params.request
    return new DeployTask({
      garden,
      log,
      graph,
      service: graph.getService(serviceName),
      force,
      forceBuild,
      fromWatch: true,
      skipRuntimeDependencies: params.request.skipDependencies,
      devModeServiceNames: [],
      hotReloadServiceNames: [],
      localModeServiceNames: [],
    })
  },
  taskRequested: async (params: CloudEventHandlerCommonParams & { request: Events["taskRequested"] }) => {
    const { garden, graph, log } = params
    const { taskName, force, forceBuild } = params.request
    return new TaskTask({
      garden,
      log,
      graph,
      task: graph.getTask(taskName),
      devModeServiceNames: [],
      hotReloadServiceNames: [],
      localModeServiceNames: [],
      force,
      forceBuild,
    })
  },
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
  garden: Garden,
  log: LogEntry,
  changedPath: string,
  operationType: "added" | "changed" | "removed"
): Promise<boolean> {
  try {
    const nextGarden = await Garden.factory(garden.projectRoot, garden.opts)
    await nextGarden.getConfigGraph({ log, emit: false })
    await nextGarden.close()
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
