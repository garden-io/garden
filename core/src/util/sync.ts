/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { exec } from "./util"
import { LogEntry } from "../logger/log-entry"
import { LogLevel } from "../logger/log-node"

/**
 * Syncs `sourcePath` with `destinationPath` using `syncOpts`. Adds options to `syncOpts` as appropriate for the
 * `withDelete` and `files` parameters.
 *
 * @param destinationPath
 *   May be a local path or a remote destination.
 * @param withDelete
 *   If `true`, files/folders in `destinationPath` that are not in `sourcePath` will also be deleted.
 * @param files
 *   If provided, only those paths will be synced. Should be relative paths from `sourcePath`.
 */
export async function syncWithOptions({
  log,
  syncOpts,
  sourcePath,
  destinationPath,
  withDelete,
  files,
}: {
  log: LogEntry
  syncOpts: string[]
  sourcePath: string
  destinationPath: string
  withDelete: boolean
  files?: string[]
}): Promise<void> {
  const opts = [...syncOpts] // We create a new array in case the caller wants to reuse the syncOpts array passed in.

  // rsync benefits from file lists being sorted.
  files && files.sort()

  let input: string | undefined

  if (withDelete) {
    opts.push("--prune-empty-dirs")

    if (files === undefined) {
      opts.push("--delete")
    } else {
      // Workaround for this issue: https://stackoverflow.com/questions/1813907
      opts.push("--include-from=-", "--exclude=*", "--delete-excluded")

      // -> Make sure the file list is anchored (otherwise filenames are matched as patterns)
      files = files.map((f) => "/" + f)

      input = "/**/\n" + files.join("\n")
    }
  } else if (files !== undefined) {
    opts.push("--files-from=-")
    input = files.join("\n")
  }

  // Avoid rendering the full file list except when at the silly log level
  if (log.root.level === LogLevel.silly) {
    log.silly(`File list: ${JSON.stringify(files)}`)
    log.silly(`Rsync args: ${[...opts, sourcePath, destinationPath].join(" ")}`)
  }

  await exec("rsync", [...opts, sourcePath, destinationPath], { input })
}
