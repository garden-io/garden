/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import chalk from "chalk"
import { keyBy, flatten, without, uniq } from "lodash"

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
import { SessionSettings } from "./commands/base"
import { Events } from "./events"
import { BuildTask } from "./tasks/build"
import { DeployTask } from "./tasks/deploy"
import { filterTestConfigs, TestTask } from "./tasks/test"
import { testFromConfig } from "./types/test"
import { applySessionSettings } from "./commands/dev"
import { TaskTask } from "./tasks/task"

export type ProcessHandler = (graph: ConfigGraph, module: GardenModule) => Promise<BaseTask[]>

interface ProcessParams {
  garden: Garden
  graph: ConfigGraph
  log: LogEntry
  footerLog?: LogEntry
  watch: boolean
  /**
   * If provided, and if `watch === true`, don't watch files in the module roots of these modules.
   */
  skipWatchModules?: GardenModule[]
  initialTasks: BaseTask[]
  /**
   * Use this if the behavior should be different on watcher changes than on initial processing
   */
  changeHandler: ProcessHandler
  sessionSettings?: SessionSettings
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
  sessionSettings,
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
      statusLine.setState({ emoji: "clock2", msg: chalk.gray("Waiting for code changes...") })
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

    if (sessionSettings) {
      // Handle Cloud events
      const params = {
        garden,
        graph,
        log,
      }
      garden.events.on("buildRequested", async (event: Events["buildRequested"]) => {
        try {
          graph = await garden.getConfigGraph({ log, emit: false })
          log.info("")
          log.info({ emoji: "hammer", msg: chalk.yellow(`Build requested for ${chalk.white(event.moduleName)}`) })
          const tasks = await cloudEventHandlers.buildRequested({ ...params, request: event })
          await garden.processTasks(tasks)
        } catch (err) {
          log.error(err.message)
        }
      })
      garden.events.on("deployRequested", async (event: Events["deployRequested"]) => {
        try {
          graph = await garden.getConfigGraph({ log, emit: false })
          let prefix: string
          let emoji: EmojiName
          if (event.hotReload) {
            emoji = "fire"
            prefix = `Hot reload-enabled deployment`
          } else {
            if (event.devMode) {
              emoji = "zap"
              prefix = `Dev-mode deployment`
            } else {
              emoji = "rocket"
              prefix = "Deployment"
            }
          }
          const msg = `${prefix} requested for ${chalk.white(event.serviceName)}`
          log.info("")
          log.info({ emoji, msg: chalk.yellow(msg) })
          const deployTask = await cloudEventHandlers.deployRequested({ ...params, request: event, sessionSettings })
          await garden.processTasks([deployTask])
        } catch (err) {
          log.error(err.message)
        }
      })
      garden.events.on("testRequested", async (event: Events["testRequested"]) => {
        try {
          graph = await garden.getConfigGraph({ log, emit: false })
          const testNames = event.testNames
          let suffix = ""
          if (testNames) {
            suffix = ` (only ${chalk.white(naturalList(testNames))})`
          }
          const msg = chalk.yellow(`Tests requested for ${chalk.white(event.moduleName)}${suffix}`)
          log.info("")
          log.info({ emoji: "thermometer", msg })
          const testTasks = await cloudEventHandlers.testRequested({ ...params, request: event, sessionSettings })
          await garden.processTasks(testTasks)
        } catch (err) {
          log.error(err.message)
        }
      })
      garden.events.on("taskRequested", async (event: Events["taskRequested"]) => {
        try {
          graph = await garden.getConfigGraph({ log, emit: false })
          const msg = chalk.yellow(`Run requested for task ${chalk.white(event.taskName)}`)
          log.info("")
          log.info({ emoji: "runner", msg })
          const taskTask = await cloudEventHandlers.taskRequested({ ...params, request: event, sessionSettings })
          await garden.processTasks([taskTask])
        } catch (err) {
          log.error(err.message)
        }
      })
      garden.events.on("setBuildOnWatch", (event: Events["setBuildOnWatch"]) => {
        try {
          const { moduleName, build } = event
          cloudEventHandlers.setBuildOnWatch(graph, moduleName, build, sessionSettings)
          const moduleNames = sessionSettings.buildModuleNames
          let msg
          if (moduleNames.length === 0) {
            msg = `Not rebuilding when sources change unless required by deploys or tests`
          } else {
            msg = `Now rebuilding ${chalk.white(naturalList(moduleNames))} when sources change`
          }
          log.info("")
          log.info({ emoji: "recycle", msg: chalk.yellow(msg) })
        } catch (err) {
          log.error(err.message)
        }
      })
      garden.events.on("setDeployOnWatch", (event: Events["setDeployOnWatch"]) => {
        try {
          const { serviceName, deploy } = event
          cloudEventHandlers.setDeployOnWatch(graph, serviceName, deploy, sessionSettings)
          const serviceNames = sessionSettings.deployServiceNames
          let msg
          if (serviceNames.length === 0) {
            msg = `Not redeploying on watch unless required by tests`
          } else {
            msg = `Now redeploying ${chalk.white(naturalList(serviceNames))} when sources change`
          }
          log.info("")
          log.info({ emoji: "recycle", msg: chalk.yellow(msg) })
        } catch (err) {
          log.error(err.message)
        }
      })
      garden.events.on("setTestOnWatch", (event: Events["setTestOnWatch"]) => {
        try {
          const { moduleName, test } = event
          cloudEventHandlers.setTestOnWatch(graph, moduleName, test, sessionSettings)
          const moduleNames = sessionSettings.testModuleNames
          let msg
          if (moduleNames.length === 0) {
            msg = `Not running tests when sources change`
          } else {
            msg = `Now running tests for ${chalk.white(naturalList(moduleNames))} when sources change`
          }
          log.info("")
          log.info({ emoji: "recycle", msg: chalk.yellow(msg) })
        } catch (err) {
          log.error(err.message)
        }
      })
    }

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
  testRequested: async (
    params: CloudEventHandlerCommonParams & { request: Events["testRequested"]; sessionSettings: SessionSettings }
  ) => {
    const { garden, graph, log, sessionSettings } = params
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
        devModeServiceNames: sessionSettings.devModeServiceNames,
        hotReloadServiceNames: sessionSettings.hotReloadServiceNames,
      })
    })
  },
  deployRequested: async (
    params: CloudEventHandlerCommonParams & { request: Events["deployRequested"]; sessionSettings: SessionSettings }
  ) => {
    const { garden, graph, log, sessionSettings } = params
    const { serviceName, devMode, hotReload, force, forceBuild } = params.request
    const allServiceNames = graph.getServices().map((s) => s.name)

    sessionSettings.devModeServiceNames = devMode
      ? addToSessionSettingsList(serviceName, sessionSettings.devModeServiceNames)
      : removeFromSessionSettingsList(serviceName, sessionSettings.devModeServiceNames, allServiceNames)

    if (!devMode) {
      sessionSettings.hotReloadServiceNames = hotReload
        ? addToSessionSettingsList(serviceName, sessionSettings.hotReloadServiceNames)
        : removeFromSessionSettingsList(serviceName, sessionSettings.hotReloadServiceNames, allServiceNames)
    }

    const { hotReloadServiceNames, devModeServiceNames } = applySessionSettings(graph, sessionSettings)

    const deployTask = new DeployTask({
      garden,
      log,
      graph,
      service: graph.getService(serviceName),
      force,
      forceBuild,
      fromWatch: true,
      hotReloadServiceNames,
      devModeServiceNames,
    })
    return deployTask
  },
  taskRequested: async (
    params: CloudEventHandlerCommonParams & { request: Events["taskRequested"]; sessionSettings: SessionSettings }
  ) => {
    const { garden, graph, log, sessionSettings } = params
    const { taskName, force, forceBuild } = params.request
    return new TaskTask({
      garden,
      log,
      graph,
      task: graph.getTask(taskName),
      hotReloadServiceNames: sessionSettings.hotReloadServiceNames,
      devModeServiceNames: sessionSettings.devModeServiceNames,
      force,
      forceBuild,
    })
  },
  setBuildOnWatch: (
    graph: ConfigGraph,
    moduleName: Events["setBuildOnWatch"]["moduleName"],
    build: Events["setBuildOnWatch"]["build"],
    sessionSettings: SessionSettings
  ) => {
    const allModuleNames = graph.getModules().map((m) => m.name)
    sessionSettings.buildModuleNames = build
      ? addToSessionSettingsList(moduleName, sessionSettings.buildModuleNames)
      : removeFromSessionSettingsList(moduleName, sessionSettings.buildModuleNames, allModuleNames)
    return sessionSettings
  },
  setDeployOnWatch: (
    graph: ConfigGraph,
    serviceName: Events["setDeployOnWatch"]["serviceName"],
    deploy: Events["setDeployOnWatch"]["deploy"],
    sessionSettings: SessionSettings
  ) => {
    const allServiceNames = graph.getServices().map((s) => s.name)
    sessionSettings.deployServiceNames = deploy
      ? addToSessionSettingsList(serviceName, sessionSettings.deployServiceNames)
      : removeFromSessionSettingsList(serviceName, sessionSettings.deployServiceNames, allServiceNames)
    return sessionSettings
  },
  setTestOnWatch: (
    graph: ConfigGraph,
    moduleName: Events["setTestOnWatch"]["moduleName"],
    test: Events["setTestOnWatch"]["test"],
    sessionSettings: SessionSettings
  ) => {
    const allModuleNames = graph.getModules().map((m) => m.name)
    sessionSettings.testModuleNames = test
      ? addToSessionSettingsList(moduleName, sessionSettings.testModuleNames)
      : removeFromSessionSettingsList(moduleName, sessionSettings.testModuleNames, allModuleNames)
    return sessionSettings
  },
}

function addToSessionSettingsList(name: string, currentList: string[]): string[] {
  return currentList[0] === "*" ? currentList : uniq([...currentList, name])
}

function removeFromSessionSettingsList(name: string, currentList: string[], fullList: string[]): string[] {
  return currentList[0] === "*" ? without(fullList, name) : without(currentList, name)
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
