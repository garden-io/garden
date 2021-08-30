/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { isAbsolute, join, resolve, relative, parse, basename } from "path"
import { emptyDir, ensureDir, remove } from "fs-extra"
import { ConfigurationError, InternalError } from "../exceptions"
import { FileCopySpec, GardenModule, getModuleKey } from "../types/module"
import { normalizeRelativePath, joinWithPosix } from "../util/fs"
import { LogEntry } from "../logger/log-entry"
import { ModuleConfig } from "../config/module"
import { ConfigGraph } from "../config-graph"
import { Profile } from "../util/profiling"
import async from "async"
import chalk from "chalk"
import { hasMagic } from "glob"
import { FileStatsHelper, syncFileAsync, cloneFile, scanDirectoryForClone, MappedPaths } from "./helpers"
import { difference } from "lodash"
import { unlink } from "fs"

const fileSyncConcurrencyLimit = 100

// FIXME: We don't want to keep special casing this module type so we need to think
// of a better way around this.
function isLocalExecModule(moduleConfig: ModuleConfig) {
  return moduleConfig.type === "exec" && moduleConfig.spec.local
}

export interface SyncParams {
  sourceRoot: string
  targetRoot: string
  sourceRelPath?: string
  targetRelPath?: string
  withDelete: boolean
  log: LogEntry
  files?: string[]
}

/**
 * Lazily construct a directory of modules inside which all build steps are performed.
 *
 * NOTE: This base implementation is still considered experimental! See rsync.ts for the BuildStagingRsync class that is
 * used by default.
 */
@Profile()
export class BuildStaging {
  constructor(protected projectRoot: string, public buildDirPath: string, public buildMetadataDirPath: string) {}

  static async factory(projectRoot: string, gardenDirPath: string) {
    // Make sure build directories exist
    const buildDirPath = join(gardenDirPath, "build")
    const buildMetadataDirPath = join(gardenDirPath, "build-metadata")
    await ensureDir(buildDirPath)
    await ensureDir(buildMetadataDirPath)

    return new BuildStaging(projectRoot, buildDirPath, buildMetadataDirPath)
  }

  async syncFromSrc(module: GardenModule, log: LogEntry) {
    // We don't sync local exec modules to the build dir
    if (isLocalExecModule(module)) {
      log.silly("Skipping syncing from source for local exec module")
      return
    }

    // Normalize to relative POSIX-style paths
    const files = module.version.files.map((f) => normalizeRelativePath(module.path, f))

    await ensureDir(module.buildPath)

    await this.sync({
      sourceRoot: resolve(this.projectRoot, module.path),
      targetRoot: module.buildPath,
      withDelete: true,
      log,
      files,
    })
  }

  async syncDependencyProducts(module: GardenModule, graph: ConfigGraph, log: LogEntry) {
    const buildPath = await this.buildPath(module)
    const buildDependencies = module.build.dependencies

    await Bluebird.map(buildDependencies, async (buildDepConfig) => {
      if (!buildDepConfig || !buildDepConfig.copy || buildDepConfig.copy.length === 0) {
        return
      }

      const sourceModule = graph.getModule(getModuleKey(buildDepConfig.name, buildDepConfig.plugin), true)
      const sourceBuildPath = await this.buildPath(sourceModule)

      await Bluebird.map(buildDepConfig.copy, (copy: FileCopySpec) => {
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

        return this.sync({
          sourceRoot: sourceBuildPath,
          targetRoot: buildPath,
          sourceRelPath: copy.source,
          targetRelPath: copy.target,
          withDelete: false,
          log,
        })
      })
    })
  }

  async clear() {
    await emptyDir(this.buildDirPath)
  }

  async buildPath(moduleOrConfig: GardenModule | ModuleConfig): Promise<string> {
    // We don't stage the build for local exec modules, so the module path is effectively the build path.
    if (isLocalExecModule(moduleOrConfig)) {
      return moduleOrConfig.path
    }

    // This returns the same result for modules and module configs
    const moduleKey = getModuleKey(moduleOrConfig.name, moduleOrConfig.plugin)

    const path = resolve(this.buildDirPath, moduleKey)
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
   * Syncs sourcePath with destinationPath.
   *
   * If withDelete = true, files/folders in targetPath that are not in sourcePath will also be deleted.
   */
  protected async sync(params: SyncParams): Promise<void> {
    let { sourceRoot, targetRoot, sourceRelPath, targetRelPath, withDelete, log, files } = params

    if (targetRelPath && hasMagic(targetRelPath)) {
      throw new ConfigurationError(`Build staging: Target path (${targetRelPath}) must not contain wildcards`, {
        sourceRoot,
        targetRoot,
        sourceRelPath,
        targetRelPath,
      })
    }

    if (sourceRelPath && isAbsolute(sourceRelPath)) {
      throw new InternalError(`Build staging: Got absolute path for sourceRelPath`, {
        sourceRoot,
        targetRoot,
        sourceRelPath,
        targetRelPath,
      })
    }

    if (targetRelPath && isAbsolute(targetRelPath)) {
      throw new InternalError(`Build staging: Got absolute path for targetRelPath`, {
        sourceRoot,
        targetRoot,
        sourceRelPath,
        targetRelPath,
      })
    }

    const statsHelper = new FileStatsHelper()

    // Source root must exist and be a directory
    let sourceStat = await statsHelper.extendedStat({ path: sourceRoot })
    if (!sourceStat || !(sourceStat.isDirectory() || sourceStat.target?.isDirectory())) {
      throw new InternalError(`Build staging: Source root ${sourceRoot} must exist and be a directory`, {
        sourceRoot,
        sourceStat,
        targetRoot,
        sourceRelPath,
        targetRelPath,
      })
    }

    // If sourceRelPath contains no wildcards, we simplify what follows by joining it with the root path
    // and setting sourceRelPath to undefined
    const sourceShouldBeDirectory = sourceRelPath?.endsWith("/")
    const sourceContainsWildcard = sourceRelPath && hasMagic(sourceRelPath)
    if (!sourceContainsWildcard) {
      sourceRoot = joinWithPosix(sourceRoot, sourceRelPath || "")
      sourceStat = await statsHelper.extendedStat({ path: sourceRoot })
      sourceRelPath = undefined
    }

    // This is to match rsync behavior
    if (targetRelPath === ".") {
      targetRelPath = sourceContainsWildcard ? "" : basename(sourceRoot)
    }

    const targetShouldBeDirectory = targetRelPath?.endsWith("/")
    const targetPath = joinWithPosix(targetRoot, targetRelPath || "")

    // Need to handle several permutations of cases, depending on what the source and target paths resolve to
    if (!sourceContainsWildcard) {
      // If the source path points to a symlink, we follow the symlink
      if (sourceStat?.target) {
        sourceRoot = sourceStat.target.path
        sourceStat = sourceStat.target
      }

      if (!sourceStat) {
        log.warn(chalk.yellow(`Build staging: Could not find source file or directory at path ${sourceRoot}`))
        return
      }
    }

    let logMsg =
      `Syncing ${files ? files.length + " files " : ""}from ` +
      `${relative(this.projectRoot, sourceRoot) || "."} to ${relative(this.projectRoot, targetPath)}`

    if (withDelete) {
      logMsg += " (and removing any extraneous files)"
    }

    log.debug(logMsg)

    const sourceIsDirectory = !sourceContainsWildcard && sourceStat && sourceStat.isDirectory()
    const sourceIsFile = !sourceContainsWildcard && sourceStat && !sourceStat.isDirectory()
    const sourceBasename = parse(sourceRoot).base

    // Throw if source path ends with a slash but is not a directory
    if (sourceShouldBeDirectory && !sourceIsDirectory) {
      throw new ConfigurationError(`Build staging: Expected source path ${sourceRoot + "/"} to be a directory`, {
        sourcePath: sourceRoot + "/",
      })
    }

    let targetStat = await statsHelper.extendedStat({ path: targetPath })
    let targetIsFile = targetStat && !targetStat.isDirectory()

    // Throw if target path ends with a slash but is not a directory
    if (targetShouldBeDirectory && targetStat && !targetStat.isDirectory()) {
      throw new ConfigurationError(
        `Build staging: Expected target path ${targetPath + "/"} to not exist or be a directory`,
        {
          targetPath: targetPath + "/",
        }
      )
    }

    // Throw if file list is specified and source+target are not both directories
    if (files && (!sourceStat?.isDirectory() || !targetStat?.isDirectory())) {
      throw new InternalError(`Build staging: Both source and target must be directories when specifying a file list`, {
        sourceRoot,
        sourceStat,
        targetPath,
        targetStat,
      })
    }

    // If source is a single file, we copy it directly and return
    if (sourceIsFile) {
      // If target exists and is a directory, copy into it, otherwise directly to the target path
      const to = targetShouldBeDirectory || targetStat?.isDirectory() ? join(targetPath, sourceBasename) : targetPath

      await syncFileAsync({
        from: sourceRoot,
        to,
        allowDelete: withDelete,
        statsHelper,
      })

      // Note: withDelete should have no effect in this instance, since we're not comparing two directories.
      return
    }

    // If source is not a file but target exists as a file, we need to handle that specifically
    if (targetIsFile) {
      if (sourceContainsWildcard) {
        throw new ConfigurationError(
          `Build staging: Attempting to copy multiple files from ${sourceRoot} to ${targetPath}, but a file exists at target path`,
          { sourcePath: sourceRoot, sourceStat, targetPath, targetStat }
        )
      } else if (withDelete) {
        // Source is a directory, delete file at target and create directory in its place before continuing
        await remove(targetPath)
        await ensureDir(targetPath)
      } else {
        throw new ConfigurationError(
          `Build staging: Attempting to copy directory from ${sourceRoot} to ${targetPath}, but a file exists at target path`,
          { sourcePath: sourceRoot, sourceStat, targetPath, targetStat }
        )
      }
    }

    // Both source and target path are directories, so we proceed to sync between them.
    const { sourcePaths, existingAtTarget } = await Bluebird.props({
      sourcePaths: (async () => {
        if (files) {
          // If a file list is provided, the relative source path is always the same as the target.
          return files.map((f) => [f, f]) as MappedPaths
        } else {
          return await scanDirectoryForClone(sourceRoot, sourceRelPath)
        }
      })(),
      existingAtTarget: withDelete ? (await scanDirectoryForClone(targetPath)).map((p) => p[0]) : [],
    })

    // TODO: optimize by making sure all directories in the file list exist before syncing

    // Note: We use callbacks instead of promises for performance reasons
    return new Promise((done, reject) => {
      async.parallel(
        [
          // Sync all the source files
          (cb) => {
            async.mapLimit(
              sourcePaths,
              fileSyncConcurrencyLimit,
              ([fromRelative, toRelative], fileCb) => {
                const from = joinWithPosix(sourceRoot, fromRelative)
                const to = joinWithPosix(targetPath, toRelative)
                cloneFile({ from, to, allowDelete: withDelete, statsHelper }, fileCb)
              },
              cb
            )
          },
          // Delete extraneous files if withDelete=true
          (cb) => {
            if (!withDelete || existingAtTarget.length === 0) {
              cb(null)
              return
            }

            // TODO: Don't delete files within symlinked directories outside the target root

            const toDelete = difference(
              existingAtTarget,
              sourcePaths.map((p) => p[1])
            )

            // TODO: Delete empty directories
            async.mapLimit(
              toDelete,
              fileSyncConcurrencyLimit,
              (targetRelative, fileCb) => {
                unlink(joinWithPosix(targetPath, targetRelative), (err) => {
                  if (err && err.code !== "ENOENT") {
                    fileCb(err)
                  } else {
                    fileCb()
                  }
                })
              },
              cb
            )
          },
        ],
        (err) => {
          if (err) {
            reject(err)
          } else {
            done()
          }
        }
      )
    })
  }
}
