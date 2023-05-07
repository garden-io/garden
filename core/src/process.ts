/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"

import { Garden } from "./garden"
import { Log } from "./logger/log-entry"
import { GardenProcess, GlobalConfigStore } from "./config-store/global"
import { sleep } from "./util/util"

export async function waitForExitEvent(garden: Garden, log: Log) {
  await new Promise((resolve) => {
    garden.events.on("_exit", () => {
      log.debug(`Manual exit triggered`)
      resolve({})
    })
  })
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

export function isRunning(pid: number) {
  // Taken from https://stackoverflow.com/a/21296291. Doesn't actually kill the process.
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

// Note: Circumvents an issue where the process exits before the output is fully flushed.
// Needed for output renderers and Winston (see: https://github.com/winstonjs/winston/issues/228)
export async function waitForOutputFlush() {
  await sleep(100)
}
