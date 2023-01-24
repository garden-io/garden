/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginCommand } from "../../../types/plugin/command"
import chalk from "chalk"
import { getMutagenEnv, mutagenCliSpec, parseSyncListResult } from "../mutagen"
import { LATEST_MUTAGEN_DATA_DIR_NAME, MUTAGEN_DIR_NAME } from "../../../constants"
import { join } from "path"
import { pathExists, readlink } from "fs-extra"
import { dedent } from "../../../util/string"
import { LogEntry } from "../../../logger/log-entry"
import { PluginTool } from "../../../util/ext-tools"

const logSuccess = (log: LogEntry) => log.info({ msg: chalk.green("\nDone!"), status: "success" })

const commonDocs = `Only works if a Garden is already running in dev mode in a separate process in this project.`

export const syncStatus: PluginCommand = {
  name: "sync-status",
  description: `Get the sync status for the current dev mode command. ${commonDocs}`,
  title: "Get the current sync status",

  handler: async ({ ctx, log }) => {
    const dataDir = await getMutagenDataDir(ctx.gardenDirPath)
    const mutagen = new PluginTool(mutagenCliSpec)

    if (!(await pathExists(dataDir))) {
      log.info(dedent`
        No active sync session found.

        Garden needs to be running in dev mode in this project for sync statuses to
        be available.
      `)

      logSuccess(log)
      return { result: [] }
    }

    const syncSessions = await getMutagenSyncSessions({ log, dataDir, mutagen })
    const result = { syncSessions }

    if (syncSessions.length === 0) {
      log.info(`Found 0 syncs.`)
    } else {
      log.info(`Found ${syncSessions.length} syncs:`)
      log.info({ data: syncSessions })
    }

    logSuccess(log)

    return { result }
  },
}

export const syncPause: PluginCommand = {
  name: "sync-pause",
  description: `Pause all active syncs. Can be resumed with the sync-resume command. ${commonDocs}`,
  title: "Pause sync",

  handler: async ({ ctx, log }) => {
    const dataDir = await getMutagenDataDir(ctx.gardenDirPath)
    const mutagen = new PluginTool(mutagenCliSpec)

    if (!(await pathExists(dataDir))) {
      log.info(dedent`
        No active sync session found.

        Garden needs to be running in dev mode in this project to be able to pause syncs.
      `)

      logSuccess(log)
      return { result: [] }
    }

    const syncSessions = await getMutagenSyncSessions({ log, dataDir, mutagen })
    const activeSyncSessionNames = syncSessions.filter((s) => !s.paused).map((s) => s.name)
    const result = { pausedSessionNames: activeSyncSessionNames }

    if (syncSessions.length === 0) {
      log.info(`No syncs found.`)
    } else if (activeSyncSessionNames.length === 0) {
      log.info(`Sync are already paused.`)
    } else {
      log.info(`Pausing ${activeSyncSessionNames.length} syncs.`)
      for (const sessionName of activeSyncSessionNames) {
        log.debug(`Pausing sync session ${sessionName}`)
        await mutagen.exec({ cwd: dataDir, log, env: getMutagenEnv(dataDir), args: ["sync", "pause", sessionName] })
      }
    }

    logSuccess(log)
    return { result }
  },
}

export const syncResume: PluginCommand = {
  name: "sync-resume",
  description: `Resume all paused syncs. ${commonDocs}`,
  title: "Resume sync",

  handler: async ({ ctx, log }) => {
    const dataDir = await getMutagenDataDir(ctx.gardenDirPath)
    const mutagen = new PluginTool(mutagenCliSpec)

    if (!(await pathExists(dataDir))) {
      log.info(dedent`
        No active sync session found.

        Garden needs to be running in dev mode in this project to be able to resume syncs.
      `)

      logSuccess(log)
      return { result: [] }
    }

    const syncSessions = await getMutagenSyncSessions({ log, dataDir, mutagen })
    const pausedSyncSessionNames = syncSessions.filter((s) => s.paused).map((s) => s.name)
    const result = { resumedSessionNames: pausedSyncSessionNames }

    if (syncSessions.length === 0) {
      log.info(`No syncs found.`)
    } else if (pausedSyncSessionNames.length === 0) {
      log.info(`Syncs are already active.`)
    } else {
      log.info(`Resuming ${pausedSyncSessionNames.length} syncs.`)
      for (const sessionName of pausedSyncSessionNames) {
        log.debug(`Resuming sync session ${sessionName}`)
        await mutagen.exec({ cwd: dataDir, log, env: getMutagenEnv(dataDir), args: ["sync", "resume", sessionName] })
      }
    }

    logSuccess(log)
    return { result }
  },
}

async function getMutagenSyncSessions({
  mutagen,
  dataDir,
  log,
}: {
  mutagen: PluginTool
  dataDir: string
  log: LogEntry
}) {
  const res = await mutagen.exec({
    cwd: dataDir,
    log,
    env: getMutagenEnv(dataDir),
    args: ["sync", "list", "--template={{ json . }}"],
  })
  return parseSyncListResult(res)
}

/**
 * Returns the "real" path to the Mutagen data dir for this project
 * by reading it from the 'LATEST_MUTAGEN_DATA_DIR_NAME' symlink which
 * is always created when the Mutagen daemon is started.
 *
 * This is based on the assumption that there's only a single Mutagen daemon
 * running per project.
 *
 * It's a little hacky but works.
 */
async function getMutagenDataDir(gardenDirPath: string) {
  const mutagenDataDirSymlink = join(gardenDirPath, MUTAGEN_DIR_NAME, LATEST_MUTAGEN_DATA_DIR_NAME)
  return readlink(mutagenDataDirSymlink)
}
