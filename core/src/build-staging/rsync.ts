/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import semver from "semver"
import { join, relative, parse } from "path"
import { ensureDir } from "fs-extra"
import { RuntimeError } from "../exceptions"
import { normalizeLocalRsyncPath, joinWithPosix } from "../util/fs"
import { exec } from "../util/util"
import { deline } from "../util/string"
import { syncWithOptions } from "../util/sync"
import { BuildStaging, SyncParams } from "./build-staging"

const minRsyncVersion = "3.1.0"
const versionRegex = /rsync  version [v]*([\d\.]+)  /

const versionDetectFailure = new RuntimeError(
  deline`
  Could not detect rsync version.
  Please make sure rsync version ${minRsyncVersion} or later is installed and on your PATH.
  `,
  {}
)

export class BuildDirRsync extends BuildStaging {
  static async factory(projectRoot: string, gardenDirPath: string) {
    // Make sure rsync is installed and is recent enough
    let version: string | undefined = undefined

    try {
      const versionOutput = (await exec("rsync", ["--version"])).stdout
      version = versionOutput.split("\n")[0].match(versionRegex)?.[1]
    } catch (error) {
      throw new RuntimeError(
        deline`
        Could not find rsync binary.
        Please make sure rsync (version ${minRsyncVersion} or later) is installed and on your PATH.
        `,
        { error }
      )
    }

    if (!version) {
      throw versionDetectFailure
    }

    let versionGte = true

    try {
      versionGte = semver.gte(version, minRsyncVersion)
    } catch (_) {
      throw versionDetectFailure
    }

    if (!versionGte) {
      throw new RuntimeError(
        deline`
        Found rsync binary but the version is too old (${version}).
        Please install version ${minRsyncVersion} or later.
        `,
        { version }
      )
    }

    // Make sure build directories exist
    const buildDirPath = join(gardenDirPath, "build")
    const buildMetadataDirPath = join(gardenDirPath, "build-metadata")
    await ensureDir(buildDirPath)
    await ensureDir(buildMetadataDirPath)

    return new BuildDirRsync(projectRoot, buildDirPath, buildMetadataDirPath)
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
      // Preserve permissions
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
