/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import chalk from "chalk"

import { BaseTask } from "./tasks/base"
import { Garden } from "./garden"
import { Log } from "./logger/log-entry"
import { ConfigGraph } from "./graph/config-graph"
import { renderDivider } from "./logger/util"
import { Action } from "./actions/types"
import { GraphResults } from "./graph/results"
import { GardenProcess, GlobalConfigStore } from "./config-store/global"

export type ProcessHandler = (graph: ConfigGraph, action: Action) => Promise<BaseTask[]>

interface ProcessParams {
  garden: Garden
  graph: ConfigGraph
  log: Log
  persistent: boolean
  initialTasks: BaseTask[]
}

export interface ProcessActionsParams extends ProcessParams {
  actions: Action[]
}

export interface ProcessResults {
  graphResults: GraphResults
  restartRequired?: boolean
}

export async function processActions({
  garden,
  log,
  actions,
  initialTasks,
  persistent,
}: ProcessActionsParams): Promise<ProcessResults> {
  log.silly("Starting processActions")

  // Let the user know if any actions are linked to a local path
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

  const results = await garden.processTasks({ tasks: initialTasks, log })

  if (!persistent) {
    return {
      graphResults: results.results,
      restartRequired: false,
    }
  }

  // Garden process is persistent but not in watch mode. E.g. used to
  // keep port forwards alive without enabling watch or sync mode.
  await new Promise((resolve) => {
    garden.events.on("_restart", () => {
      log.debug({ symbol: "info", msg: `Manual restart triggered` })
      resolve({})
    })

    garden.events.on("_exit", () => {
      log.debug({ symbol: "info", msg: `Manual exit triggered` })
      resolve({})
    })
  })

  return {
    graphResults: results.results,
    restartRequired: false,
  }
}

/**
 * Retrieve all active processes from the global config store,
 * and clean up any inactive processes from the store along the way.
 */
export async function getActiveProcesses(globalConfigStore: GlobalConfigStore) {
  const processes = await globalConfigStore.get("activeProcesses")

  // TODO: avoid multiple writes here
  await Bluebird.map(Object.entries(processes), async ([key, p]) => {
    if (!isRunning(p.pid)) {
      await globalConfigStore.delete("activeProcesses", key)
      delete processes[key]
    }
  })

  return Object.values(processes)
}

/**
 * Register the currently running process in the global config store,
 * and clean up any inactive processes from the store along the way.
 */
export async function registerProcess(
  globalConfigStore: GlobalConfigStore,
  command: string,
  args: string[]
): Promise<GardenProcess> {
  await getActiveProcesses(globalConfigStore)

  const pid = process.pid

  const record: GardenProcess = {
    command,
    arguments: args,
    pid,
    startedAt: new Date(),
    sessionId: null,
    projectName: null,
    projectRoot: null,
    environmentName: null,
    namespace: null,
    persistent: false,
    serverAuthKey: null,
    serverHost: null,
  }

  await globalConfigStore.set("activeProcesses", String(pid), record)

  return record
}

function isRunning(pid: number) {
  // Taken from https://stackoverflow.com/a/21296291. Doesn't actually kill the process.
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
