/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Garden } from "./garden.js"
import type { Log } from "./logger/log-entry.js"
import type { GardenProcess, GlobalConfigStore } from "./config-store/global.js"
import { sleep } from "./util/util.js"
import psTree from "ps-tree"

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
  await Promise.all(
    Object.entries(processes).map(async ([key, p]) => {
      if (!isRunning(p.pid)) {
        await globalConfigStore.delete("activeProcesses", key)
        delete processes[key]
      }
    })
  )

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

/**
 * Kills the process with the provided pid, and any of its child processes.
 *
 * `signalName` should be a POSIX kill signal, e.g. `SIGINT` or `SIGKILL`
 *
 * See: https://github.com/sindresorhus/execa/issues/96#issuecomment-776280798
 */
export async function killRecursive(signalName: "SIGINT" | "SIGTERM" | "SIGKILL", pid: number) {
  return new Promise<void>((resolve) => {
    psTree(pid, function (_err, children) {
      for (const p of children) {
        try {
          process.kill(parseInt(p.PID, 10), signalName)
        } catch {
          continue
        }
      }
      try {
        process.kill(pid, signalName)
      } catch {}
      resolve()
    })
  })
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
  return sleep(50)
}
