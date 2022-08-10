/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { relative, parse } from "path"
import { ensureDir } from "fs-extra"
import { normalizeLocalRsyncPath, joinWithPosix } from "../util/fs"
import { syncWithOptions } from "../util/sync"
import { BuildStaging, SyncParams } from "./build-staging"
import { validateInstall } from "../util/validateInstall"

const minRsyncVersion = "3.1.0"
const versionRegex = /rsync  version [v]*([\d\.]+)  /

/**
 * throws if no rsync is installed or version is too old
 */
export async function validateRsyncInstall() {
  await validateInstall({
    minVersion: minRsyncVersion,
    name: "rsync",
    versionCommand: { cmd: "rsync", args: ["--version"] },
    versionRegex,
  })
}

export class BuildDirRsync extends BuildStaging {
  static async factory(projectRoot: string, gardenDirPath: string) {
    await validateRsyncInstall()

    return new BuildDirRsync(projectRoot, gardenDirPath)
  }

  /**
   * Syncs sourcePath with destinationPath using rsync.
   *
   * If withDelete = true, files/folders in destinationPath that are not in sourcePath will also be deleted.
   */
  protected async sync(params: SyncParams): Promise<void> {
    const { sourceRoot, targetRoot, sourceRelPath, targetRelPath, withDelete, log, files } = params

    const sourceShouldBeDirectory = !sourceRelPath || sourceRelPath.endsWith("/")
    const targetShouldBeDirectory = targetRelPath?.endsWith("/")
    let sourcePath = joinWithPosix(sourceRoot, sourceRelPath)
    let targetPath = joinWithPosix(targetRoot, targetRelPath)

    const targetDir = parse(targetPath).dir
    const tmpDir = targetRoot + ".tmp"

    await ensureDir(targetDir)
    await ensureDir(tmpDir)

    // this is so that the cygwin-based rsync client can deal with the paths
    sourcePath = normalizeLocalRsyncPath(sourcePath)
    targetPath = normalizeLocalRsyncPath(targetPath)

    if (sourceShouldBeDirectory) {
      sourcePath += "/"
    }
    if (targetShouldBeDirectory) {
      targetPath += "/"
    }

    // the correct way to copy all contents of a folder is using a trailing slash and not a wildcard
    sourcePath = stripWildcard(sourcePath)
    targetPath = stripWildcard(targetPath)

    const syncOpts = [
      "--recursive",
      // Preserve modification times
      "--times",
      // Preserve owner + group
      "--owner",
      "--group",
      // Copy permissions
      "--perms",
      // Copy symlinks
      "--links",
      // Only allow links that point within the copied tree
      "--safe-links",
      // Ignore missing files in file list
      "--ignore-missing-args",
      // Set a temp directory outside of the target directory to avoid potential conflicts
      "--temp-dir",
      normalizeLocalRsyncPath(tmpDir),
    ]

    let logMsg =
      `Syncing ${files ? files.length + " files " : ""}from ` +
      `${relative(this.projectRoot, sourcePath)} to ${relative(this.projectRoot, targetPath)}`

    if (withDelete) {
      logMsg += " (with delete)"
    }

    log.debug(logMsg)

    await syncWithOptions({ log, syncOpts, sourcePath, destinationPath: targetPath, withDelete, files })
  }
}

function stripWildcard(path: string) {
  return path.endsWith("/*") ? path.slice(0, -1) : path
}
