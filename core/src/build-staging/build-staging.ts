/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { isAbsolute, join, resolve, relative, parse, basename } from "path"
import { ConfigurationError, InternalError, isErrnoException } from "../exceptions.js"
import { normalizeRelativePath, joinWithPosix } from "../util/fs.js"
import type { Log } from "../logger/log-entry.js"
import { Profile } from "../util/profiling.js"
import async from "async"
import { hasMagic } from "glob"
import type { MappedPaths } from "./helpers.js"
import { FileStatsHelper, syncFileAsync, cloneFile, scanDirectoryForClone } from "./helpers.js"
import { difference } from "lodash-es"
import { unlink } from "fs"
import type { BuildAction, BuildActionConfig } from "../actions/build.js"
import type { ModuleConfig } from "../config/module.js"
import fsExtra from "fs-extra"

const { emptyDir, ensureDir, mkdirp, pathExists, remove } = fsExtra

const fileSyncConcurrencyLimit = 100

export interface SyncParams {
  sourceRoot: string
  targetRoot: string
  sourceRelPath?: string
  targetRelPath?: string
  withDelete: boolean
  log: Log
  files?: string[]
}

/**
 * Lazily construct a directory of modules inside which all build steps are performed.
 *
 * NOTE: This base implementation still has known issues on Windows!
 * See rsync.ts for the BuildStagingRsync class that is used by default on Windows.
 */
@Profile()
export class BuildStaging {
  public buildDirPath: string

  private createdPaths: Set<string>

  constructor(
    protected projectRoot: string,
    gardenDirPath: string
  ) {
    this.buildDirPath = join(gardenDirPath, "build")
    this.createdPaths = new Set()
  }

  async syncFromSrc({ action, log, withDelete = true }: { action: BuildAction; log: Log; withDelete?: boolean }) {
    // We don't sync local exec modules to the build dir
    if (action.getConfig("buildAtSource")) {
      log.silly(() => `Skipping syncing from source, action ${action.longDescription()} has buildAtSource set to true`)
      return
    }

    // Normalize to relative POSIX-style paths
    const files = action.getFullVersion(log).files.map((f) => normalizeRelativePath(action.sourcePath(), f))

    const buildPath = action.getBuildPath()
    await this.ensureDir(buildPath)

    await this.sync({
      sourceRoot: resolve(this.projectRoot, action.sourcePath()),
      targetRoot: buildPath,
      withDelete,
      log,
      files,
    })
  }

  async actionBuildPathExists(action: BuildAction) {
    const buildPath = action.getBuildPath()
    return this.createdPaths.has(buildPath) || pathExists(buildPath)
  }

  async syncDependencyProducts(action: BuildAction, log: Log) {
    const buildPath = action.getBuildPath()

    await Promise.all(
      (action.getConfig("copyFrom") || []).map(async (copy) => {
        const sourceBuild = action.getDependency({ kind: "Build", name: copy.build })

        if (!sourceBuild) {
          throw new ConfigurationError({
            message: `${action.longDescription()} specifies build '${
              copy.build
            }' in \`copyFrom\` which could not be found.`,
          })
        }

        if (isAbsolute(copy.sourcePath)) {
          throw new ConfigurationError({
            message: `Source path in build dependency copy spec must be a relative path. Actually got '${copy.sourcePath}'`,
          })
        }

        if (isAbsolute(copy.targetPath)) {
          throw new ConfigurationError({
            message: `Target path in build dependency copy spec must be a relative path. Actually got '${copy.targetPath}'`,
          })
        }

        // init .garden/build directory of the source build before syncing it to the build directory of the target action
        // here we do not want to remove any existing files produce by the source build action
        await this.syncFromSrc({ action: sourceBuild, log, withDelete: false })

        return this.sync({
          sourceRoot: sourceBuild.getBuildPath(),
          targetRoot: buildPath,
          sourceRelPath: copy.sourcePath,
          targetRelPath: copy.targetPath,
          withDelete: false,
          log,
        })
      })
    )
  }

  async clear() {
    if (await pathExists(this.buildDirPath)) {
      await emptyDir(this.buildDirPath)
    }
    this.createdPaths.clear()
  }

  getBuildPath(config: BuildActionConfig<string, any> | ModuleConfig): string {
    // We don't stage the build for local modules, so the module path is effectively the build path.
    if (config.kind === "Module" && config["local"] === true) {
      return config.path
    }

    if (config["buildAtSource"]) {
      return config["internal"].basePath
    }

    // This returns the same result for modules and module configs
    return join(this.buildDirPath, config.name)
  }

  async ensureBuildPath(config: BuildActionConfig<string, any>): Promise<string> {
    const path = this.getBuildPath(config)
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
    const { targetRoot, withDelete, log, files } = params
    let { sourceRoot, sourceRelPath, targetRelPath } = params

    if (targetRelPath && hasMagic(targetRelPath)) {
      throw new ConfigurationError({
        message: `Build staging: Target path (${targetRelPath}) must not contain wildcards`,
      })
    }

    if (sourceRelPath && isAbsolute(sourceRelPath)) {
      throw new InternalError({
        message: `Build staging: Got absolute path for sourceRelPath (${sourceRelPath})`,
      })
    }

    if (targetRelPath && isAbsolute(targetRelPath)) {
      throw new InternalError({
        message: `Build staging: Got absolute path for targetRelPath (${targetRelPath})`,
      })
    }

    const statsHelper = new FileStatsHelper()

    // Source root must exist and be a directory
    let sourceStat = await statsHelper.extendedStat({ path: sourceRoot })
    if (!sourceStat || !(sourceStat.isDirectory() || sourceStat.target?.isDirectory())) {
      throw new InternalError({
        message: `Build staging: Source root ${sourceRoot} must exist and be a directory`,
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
        log.warn(`Build staging: Could not find source file or directory at path ${sourceRoot}`)
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
      throw new ConfigurationError({
        message: `Build staging: Expected source path ${sourceRoot + "/"} to be a directory`,
      })
    }

    const targetStat = await statsHelper.extendedStat({ path: targetPath })
    const targetIsFile = targetStat && !targetStat.isDirectory()

    // Throw if target path ends with a slash but is not a directory
    if (targetShouldBeDirectory && targetStat && !targetStat.isDirectory()) {
      throw new ConfigurationError({
        message: `Build staging: Expected target path ${targetPath + "/"} to not exist or be a directory`,
      })
    }

    // Throw if file list is specified and source+target are not both directories
    if (files && (!sourceStat?.isDirectory() || !targetStat?.isDirectory())) {
      throw new InternalError({
        message: `Build staging: Both source and target must be directories when specifying a file list`,
      })
    }

    // If source is a single file, we copy it directly and return
    if (sourceIsFile) {
      // If target exists and is a directory, copy into it, otherwise directly to the target path
      const to = targetShouldBeDirectory || targetStat?.isDirectory() ? join(targetPath, sourceBasename) : targetPath

      await syncFileAsync({
        log,
        sourceRoot,
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
        throw new ConfigurationError({
          message: `Build staging: Attempting to copy multiple files from ${sourceRoot} to ${targetPath}, but a file exists at target path`,
        })
      } else if (withDelete) {
        // Source is a directory, delete file at target and create directory in its place before continuing
        await remove(targetPath)
        await ensureDir(targetPath)
      } else {
        throw new ConfigurationError({
          message: `Build staging: Attempting to copy directory from ${sourceRoot} to ${targetPath}, but a file exists at target path`,
        })
      }
    }

    // Both source and target path are directories, so we proceed to sync between them.
    let sourcePaths: MappedPaths
    if (files) {
      // If a file list is provided, the relative source path is always the same as the target.
      sourcePaths = files.map((f) => [f, f]) as MappedPaths
    } else {
      sourcePaths = await scanDirectoryForClone(sourceRoot, sourceRelPath)
    }

    const existingAtTarget = withDelete ? (await scanDirectoryForClone(targetPath)).map((p) => p[0]) : []

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
                cloneFile({ log, sourceRoot, from, to, allowDelete: withDelete, statsHelper }, fileCb)
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
                  if (err && (!isErrnoException(err) || err.code !== "ENOENT")) {
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
