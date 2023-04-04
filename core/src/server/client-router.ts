/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Garden } from ".."
import { Log } from "../logger/log-entry"
import chalk from "chalk"
import { BuildTask } from "../tasks/build"
import { DeployTask } from "../tasks/deploy"
import { filterTestConfigs, TestTask } from "../tasks/test"
import { naturalList } from "../util/string"
import { ConfigGraph } from "../graph/config-graph"
import { RunTask } from "../tasks/run"
import { moduleTestNameToActionName } from "../types/module"
import { printEmoji } from "../logger/util"
import { ActionMode } from "../actions/types"

export class ClientRouter {
  private garden: Garden
  private log: Log

  constructor(garden: Garden, log: Log) {
    this.garden = garden
    this.log = log
  }

  async dispatch<T extends ClientRequestType>(requestType: T, requestParams: ClientRequests[keyof ClientRequests]) {
    // TODO: Once Cloud request types have been renamed from "buildRequested" etc. to "build", remove the cases
    // handling the suffixed types from this switch statement.
    switch (requestType) {
      case "build":
      case "buildRequested":
        return this.build(requestParams as ClientRequests["build"])
      case "deploy":
      case "deployRequested":
        return this.deploy(requestParams as ClientRequests["deploy"])
      case "test":
      case "testRequested":
        return this.test(requestParams as ClientRequests["test"])
      case "task":
      case "taskRequested":
        return this.run(requestParams as ClientRequests["task"])
      default:
        // This will result in a type error if one or more event types is forgotten above.
        const _exhaustivenessCheck: never = requestType
        return _exhaustivenessCheck
    }
  }

  async build(req: ClientRequests["build"]) {
    const { log, garden } = this
    log.info("")
    log.info(chalk.white(`🔨 Build requested for ${chalk.italic(chalk.cyan(req.moduleName))}`))

    try {
      garden.clearCaches()
      const graph = await garden.getConfigGraph({ log, emit: false })
      const task = await clientRequestHandlers.build({ log, request: req, graph, garden })
      await garden.processTasks({ log, tasks: [task] })
    } catch (err) {
      log.error(err.message)
    }
  }

  async deploy(req: ClientRequests["deploy"]) {
    const { log, garden } = this
    let prefix: string
    let emoji: string
    // local mode always takes precedence over sync mode
    if (req.mode === "local") {
      emoji = printEmoji("↔️", log)
      prefix = `Local-mode deployment`
    } else if (req.mode === "sync") {
      emoji = printEmoji("⚡", log)
      prefix = `Sync-mode deployment`
    } else {
      emoji = printEmoji("🚀", log)
      prefix = "Deployment"
    }
    const msg = `${prefix} requested for ${chalk.italic(chalk.cyan(req.serviceName))}`
    log.info("")
    log.info(emoji + chalk.white(msg))

    try {
      garden.clearCaches()
      const graph = await garden.getConfigGraph({ log, emit: false })
      const deployTask = await clientRequestHandlers.deploy({ log, request: req, graph, garden })
      await garden.processTasks({ log, tasks: [deployTask] })
    } catch (err) {
      log.error(err.message)
    }
  }

  async test(req: ClientRequests["test"]) {
    const { log, garden } = this
    const testNames = req.testNames
    let suffix = ""
    if (testNames) {
      suffix = ` (only ${chalk.italic(chalk.cyan(naturalList(testNames)))})`
    }
    const msg = chalk.white(`Tests requested for ${chalk.italic(chalk.cyan(req.moduleName))}${suffix}`)
    log.info("")
    log.info("🌡️ " + msg)

    try {
      garden.clearCaches()
      const graph = await garden.getConfigGraph({ log, emit: false })
      const testTasks = await clientRequestHandlers.test({ log, request: req, graph, garden })
      await garden.processTasks({ log, tasks: testTasks })
    } catch (err) {
      log.error(err.message)
    }
  }

  async run(req: ClientRequests["task"]) {
    const { log, garden } = this
    const msg = chalk.white(`Run requested for task ${chalk.italic(chalk.cyan(req.taskName))}`)
    log.info("")
    log.info("🏃 " + msg)

    try {
      garden.clearCaches()
      const graph = await garden.getConfigGraph({ log, emit: false })
      const taskTask = await clientRequestHandlers.run({ log, request: req, graph, garden })
      await garden.processTasks({ log, tasks: [taskTask] })
    } catch (err) {
      log.error(err.message)
    }
  }
}

// TODO-0.13: Update the field names to no longer use moduleName and taskName.
export interface ClientRequests {
  build: {
    moduleName: string
    force: boolean
  }
  deploy: {
    serviceName: string
    mode?: ActionMode
    force: boolean
    forceBuild: boolean
    skipDependencies: boolean
  }
  test: {
    moduleName: string
    force: boolean
    forceBuild: boolean
    testNames?: string[] // If not provided, run all tests for the module
    skipDependencies: boolean
  }
  // TODO-0.13: Rename to "run"
  task: {
    taskName: string
    force: boolean
    forceBuild: boolean
  }
}

// TODO: Once Cloud request types have been renamed from "buildRequested" etc. to "build", remove the suffixed types
// from this union.
export type ClientRequestType = keyof ClientRequests | `${keyof ClientRequests}Requested`

export const clientRequestNames = [
  "build",
  "buildRequested",
  "deploy",
  "deployRequested",
  "test",
  "testRequested",
  "task",
  "taskRequested",
]

export interface ClientRequestHandlerCommonParams {
  garden: Garden
  graph: ConfigGraph
  log: Log
}

export const clientRequestHandlers = {
  build: async (params: ClientRequestHandlerCommonParams & { request: ClientRequests["build"] }) => {
    const { garden, graph, log } = params
    const { moduleName, force } = params.request
    const tasks = new BuildTask({
      garden,
      log,
      graph,
      action: graph.getBuild(moduleName),
      force,
    })
    return tasks
  },
  deploy: async (params: ClientRequestHandlerCommonParams & { request: ClientRequests["deploy"] }) => {
    const { garden, graph, log } = params
    const { serviceName, force, forceBuild } = params.request
    return new DeployTask({
      garden,
      log,
      graph,
      action: graph.getDeploy(serviceName),
      force,
      forceBuild,

      skipRuntimeDependencies: params.request.skipDependencies,
    })
  },
  test: async (params: ClientRequestHandlerCommonParams & { request: ClientRequests["test"] }) => {
    const { garden, graph, log } = params
    const { moduleName, testNames, force, forceBuild } = params.request
    const module = graph.getModule(moduleName)
    return filterTestConfigs(module, testNames).map((config) => {
      const testName = moduleTestNameToActionName(params.request.moduleName, config.name)
      return new TestTask({
        garden,
        graph,
        log,
        force,
        forceBuild,
        action: graph.getTest(testName),
        skipRuntimeDependencies: params.request.skipDependencies,
      })
    })
  },
  run: async (params: ClientRequestHandlerCommonParams & { request: ClientRequests["task"] }) => {
    const { garden, graph, log } = params
    const { taskName, force, forceBuild } = params.request
    return new RunTask({
      garden,
      log,
      graph,
      action: graph.getRun(taskName),
      force,
      forceBuild,
    })
  },
}
