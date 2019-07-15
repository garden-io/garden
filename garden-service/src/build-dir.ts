/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { map as bluebirdMap } from "bluebird"
import {
  isAbsolute,
  join,
  parse,
  resolve,
  sep,
  relative,
} from "path"
import { emptyDir, ensureDir } from "fs-extra"
import { ConfigurationError } from "./exceptions"
import { FileCopySpec, Module, getModuleKey } from "./types/module"
import { zip } from "lodash"
import * as execa from "execa"
import { normalizeLocalRsyncPath } from "./util/fs"
import { LogEntry } from "./logger/log-entry"

// Lazily construct a directory of modules inside which all build steps are performed.

export class BuildDir {
  constructor(private projectRoot: string, public buildDirPath: string, public buildMetadataDirPath: string) { }

  static async factory(projectRoot: string, gardenDirPath: string) {
    const buildDirPath = join(gardenDirPath, "build")
    const buildMetadataDirPath = join(gardenDirPath, "build-metadata")
    await ensureDir(buildDirPath)
    await ensureDir(buildMetadataDirPath)
    return new BuildDir(projectRoot, buildDirPath, buildMetadataDirPath)
  }

  async syncFromSrc(module: Module, log: LogEntry) {
    const files = module.version.files
      .map(f => relative(module.path, f))

    await this.sync({
      module,
      sourcePath: resolve(this.projectRoot, module.path) + sep,
      destinationPath: module.buildPath,
      withDelete: true,
      log,
      files,
    })
  }

  async syncDependencyProducts(module: Module, log: LogEntry) {
    const buildPath = await this.buildPath(module.name)
    const buildDependencies = await module.build.dependencies
    const dependencyConfigs = module.build.dependencies || []

    await bluebirdMap(zip(buildDependencies, dependencyConfigs), async ([sourceModule, depConfig]) => {
      if (!sourceModule || !depConfig || !depConfig.copy) {
        return
      }

      const sourceBuildPath = await this.buildPath(getModuleKey(sourceModule.name, sourceModule.plugin))

      // Sync to the module's top-level dir by default.
      await bluebirdMap(depConfig.copy, (copy: FileCopySpec) => {
        if (isAbsolute(copy.source)) {
          throw new ConfigurationError(`Source path in build dependency copy spec must be a relative path`, {
            copySpec: copy,
          })
        }

        if (isAbsolute(copy.target)) {
          throw new ConfigurationError(`Target path in build dependency copy spec must be a relative path`, {
            copySpec: copy,
          })
        }

        const sourcePath = join(sourceBuildPath, copy.source)
        const destinationPath = join(buildPath, copy.target)
        return this.sync({ module, sourcePath, destinationPath, withDelete: false, log })
      })
    })
  }

  async clear() {
    await emptyDir(this.buildDirPath)
  }

  async buildPath(moduleName: string): Promise<string> {
    const path = resolve(this.buildDirPath, moduleName)
    await ensureDir(path)
    return path
  }

  /**
   * This directory can be used to store build-related metadata for a given module, for example the last built
   * version for exec modules.
   */
  async buildMetadataPath(moduleName: string): Promise<string> {
    const path = resolve(this.buildMetadataDirPath, moduleName)
    await ensureDir(path)
    return path
  }

  /**
   * Syncs sourcePath with destinationPath using rsync.
   *
   * If withDelete = true, files/folders in destinationPath that are not in sourcePath will also be deleted.
   */
  private async sync(
    { module, sourcePath, destinationPath, withDelete, log, files }:
      {
        module: Module,
        sourcePath: string,
        destinationPath: string,
        withDelete: boolean,
        log: LogEntry,
        files?: string[],
      },
  ): Promise<void> {
    const destinationDir = parse(destinationPath).dir
    await ensureDir(destinationDir)

    // this is so that the cygwin-based rsync client can deal with the paths
    sourcePath = normalizeLocalRsyncPath(sourcePath)
    destinationPath = normalizeLocalRsyncPath(destinationPath)

    // the correct way to copy all contents of a folder is using a trailing slash and not a wildcard
    sourcePath = stripWildcard(sourcePath)
    destinationPath = stripWildcard(destinationPath)

    // --exclude is required for modules where the module and project are in the same directory
    const syncOpts = ["-rptgo", `--exclude=${this.buildDirPath}`]

    if (withDelete) {
      syncOpts.push("--delete")
    }

    let logMsg = `Syncing ${module.version.files.length} files from ` +
      `${relative(this.projectRoot, sourcePath)} to ${relative(this.projectRoot, destinationPath)}`

    if (withDelete) {
      logMsg += " (with delete)"
    }

    log.debug(logMsg)

    let input: string | undefined

    if (files !== undefined) {
      syncOpts.push("--files-from=-")
      input = files.join("\n")
    }

    await execa("rsync", [...syncOpts, sourcePath, destinationPath], { input })
  }
}

function stripWildcard(path: string) {
  return path.endsWith("/*") ? path.slice(0, -1) : path
}
