/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { isAbsolute, join, resolve, relative, parse, basename } from "path"
import { emptyDir, ensureDir, mkdirp, pathExists, remove } from "fs-extra"
import { ConfigurationError, InternalError } from "../exceptions"
import { normalizeRelativePath, joinWithPosix } from "../util/fs"
import { LogEntry } from "../logger/log-entry"
import { Profile } from "../util/profiling"
import async from "async"
import chalk from "chalk"
import { hasMagic } from "glob"
import { FileStatsHelper, syncFileAsync, cloneFile, scanDirectoryForClone, MappedPaths } from "./helpers"
import { difference } from "lodash"
import { unlink } from "fs"
import { BuildAction, BuildActionConfig } from "../actions/build"
import { ModuleConfig } from "../config/module"

const fileSyncConcurrencyLimit = 100

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
  public buildDirPath: string
  public buildMetadataDirPath: string

  private createdPaths: Set<string>

  constructor(protected projectRoot: string, gardenDirPath: string) {
    this.buildDirPath = join(gardenDirPath, "build")
    this.buildMetadataDirPath = join(gardenDirPath, "build-metadata")
    this.createdPaths = new Set()
  }

  async syncFromSrc(action: BuildAction, log: LogEntry) {
    // We don't sync local exec modules to the build dir
    if (action.getConfig("buildAtSource")) {
      log.silly(`Skipping syncing from source, action ${action.longDescription()} has buildAtSource set to true`)
      return
    }

    // Normalize to relative POSIX-style paths
    const files = action.getFullVersion().files.map((f) => normalizeRelativePath(module.path, f))

    await this.ensureDir(action.getBuildPath())

    await this.sync({
      sourceRoot: resolve(this.projectRoot, action.basePath()),
      targetRoot: action.getBuildPath(),
      withDelete: true,
      log,
      files,
    })
  }

  async syncDependencyProducts(action: BuildAction, log: LogEntry) {
    const buildPath = action.getBuildPath()

    await Bluebird.map(action.getConfig("copyFrom") || [], async (copy) => {
      const sourceBuild = action.getDependency({ kind: "Build", name: copy.build })

      if (!sourceBuild) {
        throw new ConfigurationError(
          `${action.longDescription()} specifies build '${copy.build}' in \`copyFrom\` which could not be found.`,
          { actionKey: action.key(), copy }
        )
      }

      const sourceBuildPath = sourceBuild.getBuildPath()

      if (isAbsolute(copy.sourcePath)) {
        throw new ConfigurationError(`Source path in build dependency copy spec must be a relative path`, {
          copySpec: copy,
        })
      }

      if (isAbsolute(copy.targetPath)) {
        throw new ConfigurationError(`Target path in build dependency copy spec must be a relative path`, {
          copySpec: copy,
        })
      }

      return this.sync({
        sourceRoot: sourceBuildPath,
        targetRoot: buildPath,
        sourceRelPath: copy.sourcePath,
        targetRelPath: copy.targetPath,
        withDelete: false,
        log,
      })
    })
  }

  async clear() {
    if (await pathExists(this.buildDirPath)) {
      await emptyDir(this.buildDirPath)
    }
    this.createdPaths.clear()
  }

  // TODO-G2: remove
  // TODO-G2: ensure build path elsewhere?
  getBuildPath(config: BuildActionConfig<string, any> | ModuleConfig): string {
    // We don't stage the build for local exec modules, so the module path is effectively the build path.
    if (config.kind === "Module" && config.type === "exec" && config["local"] === true) {
      return config.path
    }

    if (config["buildAtSource"]) {
      return config["basePath"]
    }

    // This returns the same result for modules and module configs
    return join(this.buildDirPath, config.name)
  }

  async ensureBuildPath(config: BuildActionConfig<string, any>): Promise<string> {
    const path = this.getBuildPath(config)
    await this.ensureDir(path)
    return path
  }

  /**
   * This directory can be used to store build-related metadata for a given module, for example the last built
   * version for exec modules.
   */
  getBuildMetadataPath(moduleName: string) {
    return join(this.buildMetadataDirPath, moduleName)
  }

  async ensureBuildMetadataPath(moduleName: string): Promise<string> {
    const path = this.getBuildMetadataPath(moduleName)
    await this.ensureDir(path)
    return path
  }

  async ensureDir(path: string) {
    if (!this.createdPaths.has(path)) {
      await mkdirp(path)
      this.createdPaths.add(path)
    }
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
