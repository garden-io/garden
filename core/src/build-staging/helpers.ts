/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { readlink, copyFile, constants, utimes } from "fs"
import readdir from "@jsdevtools/readdir-enhanced"
import { splitLast } from "../util/util"
import { Minimatch } from "minimatch"
import { promisify } from "bluebird"
import { isAbsolute, parse, basename, resolve } from "path"
import { ensureDir, Stats, lstat, remove } from "fs-extra"
import { FilesystemError, InternalError } from "../exceptions"
import async, { AsyncResultCallback } from "async"
import { round } from "lodash"

export type MappedPaths = [string, string][]

export interface CloneFileParams {
  from: string
  to: string
  allowDelete: boolean
  statsHelper: FileStatsHelper
}

interface SyncResult {
  skipped: boolean
}

type SyncCallback = AsyncResultCallback<SyncResult, Error>

/**
 * Synchronizes (clones) a single file in one direction.
 */
export function cloneFile({ from, to, allowDelete, statsHelper }: CloneFileParams, done: SyncCallback) {
  // Stat the files
  async.parallel<ExtendedStats | null>(
    {
      sourceStats: (cb) => statsHelper.extendedStat({ path: from }, cb),
      targetStats: (cb) => statsHelper.extendedStat({ path: to }, cb),
    },
    (err, result) => {
      if (err) {
        return done(err)
      }

      let sourceStats = result!.sourceStats || null
      const targetStats = result!.targetStats || null

      // Skip if source file doesn't exist
      if (!sourceStats) {
        return done(null, { skipped: true })
      }

      // Follow symlink on source, if applicable
      if (sourceStats.isSymbolicLink()) {
        if (sourceStats.target) {
          sourceStats = sourceStats.target
        } else {
          // Symlink couldn't be resolved, so we ignore it
          done(null, { skipped: true })
        }
      }

      if (!sourceStats.isFile()) {
        return done(new FilesystemError(`Attempted to copy non-file ${from}`, { from, to, sourceStats }))
      }

      if (targetStats) {
        // If target is a directory and deletes are allowed, delete the directory before copying, otherwise throw
        if (targetStats.isDirectory()) {
          if (allowDelete) {
            return remove(to, (removeErr) => {
              if (removeErr) {
                return done(removeErr)
              } else {
                return doClone({ from, to, sourceStats: sourceStats!, done, statsHelper })
              }
            })
          } else {
            return done(
              new FilesystemError(
                `Build staging: Failed copying file ${from} to ${to} because a directory exists at the target path`,
                {
                  sourcePath: from,
                  targetPath: to,
                  sourceStats,
                  targetStats,
                }
              )
            )
          }
        }

        // Skip if both files exist, size and mtime is the same (to a precision of 2 decimal points)
        if (sourceStats.size === targetStats.size && round(sourceStats.mtimeMs, 2) === round(targetStats.mtimeMs, 2)) {
          return done(null, { skipped: true })
        }
      }

      return doClone({ from, to, sourceStats, done, statsHelper })
    }
  )
}

// For convenience in testing
export const cloneFileAsync = promisify(cloneFile)

interface CopyParams {
  from: string
  to: string
  sourceStats: Stats
  done: SyncCallback
  statsHelper: FileStatsHelper
  resolvedSymlinkPaths?: string[]
}

function doClone(params: CopyParams) {
  const { from, to, done, sourceStats } = params
  const dir = parse(to).dir

  // TODO: take care of this ahead of time to avoid the extra i/o
  ensureDir(dir, undefined, (err) => {
    if (err) {
      return done(err)
    }

    // COPYFILE_FICLONE instructs the function to use a copy-on-write reflink on platforms/filesystems where available
    copyFile(from, to, constants.COPYFILE_FICLONE, (copyErr) => {
      if (copyErr) {
        return done(copyErr)
      }
      // Set the mtime on the cloned file to the same as the source file
      utimes(to, new Date(), sourceStats.mtimeMs / 1000, (utimesErr) => {
        if (utimesErr) {
          return done(utimesErr)
        }
        done(null, { skipped: false })
      })
    })
  })
}

// Just wraps the above function as a convenience for code-paths where it makes more sense to await
// (i.e. not very performance-sensitive spots)
export const syncFileAsync = promisify(cloneFile)

/**
 * Scans the given `sourceRoot` and returns an array of [from, to] tuples, listing all the matched source files,
 * relative to the source root and the relative path they should be copied to (which will always be the same if no
 * `pattern` is specified). Optionally matches files and directories in it the source directory against `pattern`,
 * which should be a standard POSIX-style glob.
 *
 * This is designed to match rsync behavior, in terms of how paths are matched and mapped.
 *
 * Symlinked directories are also traversed and its contents matched against the `pattern` if applicable.
 */
export async function scanDirectoryForClone(root: string, pattern?: string): Promise<MappedPaths> {
  // TODO: ignore symlinks that point outside of `root`!

  // No wildcards, so we just read and return the entire set of files from the source directory.
  if (!pattern) {
    return (await readdir(root, { deep: true, filter: (stats) => stats.isFile() })).map((f) => [f, f])
  }

  // We have a pattern to match, so we go into the more complex routine.
  // The tricky bit here is that we need to match both on file names and directory names, and then
  // proceed to include all files within directories that match the glob expression. We rely on the readdir library
  // behavior, which will pass the directory through the filter first, and then we can check if following files
  // match that directory and map appropriately.
  // Notice that a file/dir may be copied multiple times if it is matched in several ways by the glob, e.g. both on
  // its own name and a parent directory. This matches rsync behavior.
  const matchedDirectories: string[] = []
  const mappedPaths: MappedPaths = []

  const mm = new Minimatch(pattern)

  // TODO: ignore links that points outside of `root`
  await readdir(root, {
    deep: true,
    sep: "/",
    filter: (stats) => {
      // See if this is a file within a previously matched directory
      // Note: `stats.path` is always POSIX formatted, relative to `sourceRoot`
      if (stats.isFile()) {
        for (const dirPath of matchedDirectories) {
          if (stats.path.startsWith(dirPath + "/")) {
            // The file is in a matched directory. We need to map the target path, such that everything ahead of
            // the matched directory's basename is trimmed off.
            const prefix = splitLast(dirPath, "/")[0]
            mappedPaths.push([stats.path, stats.path.slice(prefix ? prefix.length + 1 : 0)])
          }
        }
      }

      if (mm.match(stats.path)) {
        if (stats.isDirectory()) {
          matchedDirectories.push(stats.path)
        } else if (stats.isFile()) {
          // When we match a file to the glob, we map it from the source path to just its basename under the target
          // directory. Again, this matches rsync behavior.
          mappedPaths.push([stats.path, basename(stats.path)])
        }
      }

      // For now we pass everything through the filter so that we scan the whole source tree, but we might be able
      // to optimize here to avoid unnecessary scanning.
      // It's not _super_ important though, because this routine is really only used when copying between build
      // staging directories, which won't have a lot of superfluous data.
      return true
    },
  })

  return mappedPaths
}

export class ExtendedStats extends Stats {
  path: string
  target?: ExtendedStats | null

  static fromStats(stats: Stats, path: string, target?: ExtendedStats | null) {
    const o = new ExtendedStats()
    Object.assign(o, stats)
    o.path = path
    o.target = target
    return o
  }
}

interface ExtendedStatsParams {
  path: string
  allowAbsoluteSymlinks?: boolean
}

export interface ResolveSymlinkParams {
  path: string
  allowAbsolute?: boolean
  _resolvedPaths?: string[]
}

type ExtendedStatsCallback = (err: NodeJS.ErrnoException | null, stats: ExtendedStats | null) => void

/**
 * A helper class for getting information about files/dirs, that caches the stats for the lifetime of the class, and
 * provides some extended information, e.g. where a symlink resolves to and the stats on the target.
 * The idea is for an instance to be used for the duration of e.g. one sync flow, but not for longer.
 */
export class FileStatsHelper {
  private lstatCache: { [path: string]: Stats }
  private extendedStatCache: { [path: string]: ExtendedStats | null }

  constructor() {
    this.lstatCache = {}
    this.extendedStatCache = {}
  }

  /**
   * Calls fs.lstat on the given path, and caches the result.
   */
  lstat(path: string, cb: (err: NodeJS.ErrnoException | null, stats: Stats) => void) {
    if (this.lstatCache[path]) {
      cb(null, this.lstatCache[path])
    } else {
      lstat(path, (err, stats) => {
        if (!err) {
          this.lstatCache[path] = stats
        }
        cb(err, stats)
      })
    }
  }

  /**
   * Extended path stat that provides some extended information, e.g. where a symlink resolves to and the stats on
   * the target. Note the following specific behavior of this method:
   *
   * - `path` must be an absolute path. An error is thrown otherwise.
   * - If the `path` itself does not exist, null is returned.
   * - If the `path` points to a symlink, it is recursively resolved and `target` is set with the final destination
   *   path and stats.
   * - By default, absolute symlinks are not allowed, i.e. if one is encountered, `target` will be undefined.
   *   Set `allowAbsoluteSymlinks: true` to permit resolution of absolute symlinks.
   * - If the path is a symlink but the target is not resolvable (a target can't be found or symlinks are circular),
   *   `stats.isSymbolicLink()` will be `true` and `target` will be undefined. You may want to handle that case
   *   specifically.
   * - If a callback is not provided, a Promise is returned.
   */
  extendedStat(params: ExtendedStatsParams): Promise<ExtendedStats | null>
  extendedStat(params: ExtendedStatsParams, done: ExtendedStatsCallback): void
  extendedStat(params: ExtendedStatsParams, done?: ExtendedStatsCallback) {
    const { path, allowAbsoluteSymlinks } = params

    this.assertAbsolute(path)

    if (this.extendedStatCache[path] !== undefined) {
      if (done) {
        return done(null, this.extendedStatCache[path])
      } else {
        return this.extendedStatCache[path]
      }
    }

    const stat = (cb: ExtendedStatsCallback) => {
      this.lstat(path, (lstatErr, lstats) => {
        if (lstatErr) {
          cb(lstatErr, null)
        } else if (lstats.isSymbolicLink()) {
          this.resolveSymlink({ path, allowAbsolute: allowAbsoluteSymlinks }, (symlinkErr, target) => {
            cb(symlinkErr, ExtendedStats.fromStats(lstats, path, target))
          })
        } else {
          cb(null, ExtendedStats.fromStats(lstats, path))
        }
      })
    }

    if (done) {
      return stat((err, stats) => {
        if (err?.code === "ENOENT") {
          done(null, null)
        } else {
          this.extendedStatCache[params.path] = stats
          done(err, stats)
        }
      })
    } else {
      return new Promise((_resolve, _reject) => {
        stat((err, stats) => {
          if (err?.code === "ENOENT") {
            _resolve(null)
          } else if (err) {
            _reject(err)
          } else {
            this.extendedStatCache[params.path] = stats
            _resolve(stats)
          }
        })
      })
    }
  }

  /**
   * Recursively resolve a symlink at the specified path to an absolute path. Resolves the callback with a path and
   * fs.Stats for the resolved target, if one can be resolved. If target cannot be found, the callback is resolved
   * with a null value.
   *
   * `path` must be an absolute path (an error is thrown otherwise).
   *
   * By default, absolute symlinks are ignored, and if one is encountered the method resolves to null. Set
   * `allowAbsolute: true` to allow absolute symlinks.
   */
  resolveSymlink(
    params: ResolveSymlinkParams,
    cb: (err: NodeJS.ErrnoException | null, target: ExtendedStats | null) => void
  ) {
    const { path, allowAbsolute } = params
    const _resolvedPaths = params._resolvedPaths || [path]

    this.assertAbsolute(path)

    // Get the link target path
    // Note: We're not using realpath here because we need to be able to assert than symlinks aren't absolute
    readlink(path, (readlinkErr, target) => {
      if (readlinkErr?.code === "ENOENT") {
        // Symlink target not found, so we ignore it
        return cb(null, null)
      } else if (readlinkErr) {
        return cb(new InternalError(`Error reading symlink: ${readlinkErr.message}`, { path, readlinkErr }), null)
      }

      // Ignore absolute symlinks unless specifically allowed
      // TODO: also allow limiting links to a certain absolute path
      if (isAbsolute(target) && !allowAbsolute) {
        return cb(null, null)
      }

      // Resolve the symlink path
      const targetPath = resolve(parse(path).dir, target)

      // Stat the final path and return
      this.lstat(targetPath, (statErr, targetStats) => {
        if (statErr?.code === "ENOENT") {
          // Can't find the final target, so we ignore it
          cb(null, null)
        } else if (statErr) {
          // Propagate other errors
          cb(statErr, null)
        } else if (targetStats.isSymbolicLink()) {
          // Keep resolving until we get to a real path
          if (_resolvedPaths.includes(targetPath)) {
            // We've gone into a symlink loop, so we ignore it
            cb(null, null)
          } else {
            this.resolveSymlink(
              { path: targetPath, allowAbsolute, _resolvedPaths: [..._resolvedPaths, targetPath] },
              cb
            )
          }
        } else {
          // Return with path and stats for final symlink target
          cb(null, ExtendedStats.fromStats(targetStats, targetPath))
        }
      })
    })
  }

  private assertAbsolute(path: string) {
    if (!isAbsolute(path)) {
      throw new InternalError(`Must specify absolute path (got ${path})`, { path })
    }
  }
}
