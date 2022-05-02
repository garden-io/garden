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

import { BaseTask } from "./tasks/base"
import { GraphResults } from "./task-graph"
import { Garden } from "./garden"
import { EmojiName, LogEntry } from "./logger/log-entry"
import { ConfigGraph } from "./graph/config-graph"
import { dedent } from "./util/string"
import { ConfigurationError } from "./exceptions"
import { uniqByName } from "./util/util"
import { renderDivider } from "./logger/util"
import { Events } from "./events"
import { BuildTask } from "./tasks/build"
import { DeployTask } from "./tasks/deploy"
import { filterTestConfigs, TestTask } from "./tasks/test"
import { testFromConfig } from "./types/test"
import { TaskTask } from "./tasks/task"
import { Action, actionReferenceToString } from "./actions/base"

export type ProcessHandler = (graph: ConfigGraph, action: Action) => Promise<BaseTask[]>

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
  skipWatch?: Action[]
  initialTasks: BaseTask[]
  /**
   * Use this if the behavior should be different on watcher changes than on initial processing
   */
  changeHandler: ProcessHandler
}

export interface ProcessActionsParams extends ProcessParams {
  actions: Action[]
}

export interface ProcessResults {
  taskResults: GraphResults
  restartRequired?: boolean
}

let statusLine: LogEntry

export async function processActions({
  garden,
  graph,
  log,
  footerLog,
  actions,
  initialTasks,
  skipWatch,
  watch,
  changeHandler,
  overRideWatchStatusLine,
}: ProcessActionsParams): Promise<ProcessResults> {
  log.silly("Starting processActions")

  // Let the user know if any actions are linked to a local path
  // TODO-G2: feels like this needs revisiting... - JE
  const linkedActionsMsg = actions
    .filter((a) => a.isLinked())
    .map((a) => `${a.longDescription()} linked to path ${chalk.white(a.basePath())}`)
    .map((msg) => "  " + msg) // indent list

  if (linkedActionsMsg.length > 0) {
    log.info(renderDivider())
    log.info(chalk.gray(`The following actions are linked to a local path:\n${linkedActionsMsg.join("\n")}`))
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
    refs: actions.map((a) => a.reference()),
    recursive: true,
  })
  const actionsToWatch = uniqByName([...deps, ...actions])
  const actionsByRef = keyBy(actionsToWatch, (a) => a.key())

  await garden.startWatcher({ graph, skipActions: skipWatch })

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

    garden.events.on("actionConfigChanged", async (event) => {
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

    garden.events.on("actionSourcesChanged", async (event) => {
      graph = await garden.getConfigGraph({ log, emit: false })
      const changedActionRefs = event.refs.filter((ref) => !!actionsByRef[actionReferenceToString(ref)])

      if (changedActionRefs.length === 0) {
        return
      }

      // Make sure the modules' versions are up to date.
      const changedActions = graph.getActions({ refs: changedActionRefs })

      const tasks = flatten(
        await Bluebird.map(changedActions, async (a) => {
          actionsByRef[a.name] = a
          return changeHandler!(graph, a)
        })
      )
      await garden.processTasks(tasks)
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
 * TODO: initialize devModeDeployNames/localModeDeployNames
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
        devModeDeployNames: [],
        localModeDeployNames: [],
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
      devModeDeployNames: [],
      localModeDeployNames: [],
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
      devModeDeployNames: [],
      localModeDeployNames: [],
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
