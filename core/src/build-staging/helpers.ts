/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { readlink, copyFile, constants, utimes, symlink } from "fs"
import readdir from "@jsdevtools/readdir-enhanced"
import { dedent, splitLast } from "../util/string.js"
import { Minimatch } from "minimatch"
import { isAbsolute, parse, basename, resolve, join, dirname } from "path"
import fsExtra from "fs-extra"
import { ConfigurationError, FilesystemError, InternalError, isErrnoException } from "../exceptions.js"
import type { AsyncResultCallback } from "async"
import async from "async"
import { round } from "lodash-es"
import { promisify } from "util"
import { styles } from "../logger/styles.js"
import { emitNonRepeatableWarning } from "../warnings.js"
import { type Log } from "../logger/log-entry.js"
import type { StatsBase } from "node:fs"

const { ensureDir, lstat, remove } = fsExtra

export type MappedPaths = [string, string][]

export interface CloneFileParams {
  log: Log
  sourceRoot: string
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
export function cloneFile(
  { log, sourceRoot, from, to, allowDelete, statsHelper }: CloneFileParams,
  done: SyncCallback
) {
  // Stat the files
  async.parallel<ExtendedStats | null>(
    {
      fromStats: (cb) => statsHelper.extendedStat({ path: from }, cb),
      toStats: (cb) => statsHelper.extendedStat({ path: to }, cb),
    },
    (err, result) => {
      if (err) {
        return done(err)
      }

      let fromStats = result!.fromStats || null
      const toStats = result!.toStats || null

      // Skip if source file doesn't exist
      if (!fromStats) {
        return done(null, { skipped: true })
      }

      if (fromStats.isSymbolicLink()) {
        if (!fromStats.targetPath) {
          // This symlink failed validation (e.g. it is absolute, when absolute symlinks are not allowed)
          return done(null, { skipped: true })
        }
        const resolved = resolve(dirname(fromStats.path), fromStats.targetPath)
        const outOfBounds = !resolved.startsWith(join(sourceRoot, "/"))
        if (outOfBounds) {
          const outOfBoundsMessage = dedent`
            The action's source directory (when using ${styles.highlight("staged builds")}), or build directory (when using ${styles.highlight("copyFrom")}), must be self-contained.

            Encountered a symlink at ${styles.highlight(fromStats.path)} whose target ${styles.highlight(fromStats.targetPath)} is out of bounds (not inside ${sourceRoot}).

            In case this is not acceptable, you can disable build staging by setting ${styles.highlight("buildAtSource: true")} in the action configuration to disable build staging for this action.`
          if (fromStats.target?.isFile()) {
            // For compatibility with older versions of garden that would allow symlink targets outside the root, if the target file existed, we only emit a warning here.
            // TODO(0.15): Throw an error here
            emitNonRepeatableWarning(log, outOfBoundsMessage + `\n\nWARNING: This will become an error in Garden 0.14.`)
            // For compatibility with older versions of Garden, copy the target file instead of reproducing the symlink
            // TODO(0.15): Only reproduce the symlink. The target file will be copied in another call to `cloneFile`.
            fromStats = fromStats.target
          } else {
            // Note: If a symlink pointed to a directory, we threw another error "source is neither a symbolic link, nor a file" in previous versions of garden,
            // so this is not a breaking change.
            return done(
              new ConfigurationError({
                message: outOfBoundsMessage,
              })
            )
          }
        }
      }

      if (!fromStats.isFile() && !fromStats.isSymbolicLink()) {
        return done(
          // Using internal error here because if this happens, it's a logical error here in this code
          new InternalError({
            message: `Error while copying from '${from}' to '${to}': Source is neither a symbolic link, nor a file.`,
          })
        )
      }

      if (toStats) {
        // If target is a directory and deletes are allowed, delete the target before copying, otherwise throw
        if (toStats.isDirectory()) {
          if (allowDelete) {
            return remove(to, (removeErr) => {
              if (removeErr) {
                return done(removeErr)
              } else {
                return doClone({ from, to, fromStats: fromStats!, done, statsHelper })
              }
            })
          } else {
            return done(
              new FilesystemError({
                message: `Build staging: Failed copying file from '${from}' to '${to}' because a directory exists at the target path`,
              })
            )
          }
        }

        if (fromStats.isSymbolicLink() && toStats.isSymbolicLink() && fromStats.targetPath === toStats.targetPath) {
          // skip if both symlinks are equal
          return done(null, { skipped: true })
        } else if (fromStats.size === toStats.size && round(fromStats.mtimeMs, 2) === round(toStats.mtimeMs, 2)) {
          // Skip if both files exist, size and mtime is the same (to a precision of 2 decimal points)
          return done(null, { skipped: true })
        }
      }

      // if we are about to copy a symlink, and the target path exists, we must remove it first
      // this allows for type changes (e.g. replacing a file with a symlink, then running garden build)
      // at this point we know the target is a file or a symlink, so we can do this even if allowDelete=false (copy also overwrites the target)
      if (fromStats.isSymbolicLink()) {
        return remove(to, (removeErr) => {
          if (removeErr) {
            return done(removeErr)
          } else {
            return doClone({ from, to, fromStats: fromStats!, done, statsHelper })
          }
        })
      }

      return doClone({ from, to, fromStats, done, statsHelper })
    }
  )
}

// For convenience in testing
export const cloneFileAsync = promisify(cloneFile) as (params: CloneFileParams) => Promise<SyncResult> // async marks the return type as optional

interface CopyParams {
  from: string
  to: string
  fromStats: ExtendedStats
  done: SyncCallback
  statsHelper: FileStatsHelper
  resolvedSymlinkPaths?: string[]
}

function doClone(params: CopyParams) {
  const { from, to, done, fromStats } = params
  const dir = parse(to).dir

  // TODO: take care of this ahead of time to avoid the extra i/o
  ensureDir(dir, (err) => {
    if (err) {
      return done(err)
    }

    const setUtimes = () => {
      // Set the mtime on the cloned file to the same as the source file
      utimes(to, new Date(), fromStats.mtimeMs / 1000, (utimesErr) => {
        if (utimesErr && (!isErrnoException(utimesErr) || utimesErr.code !== "ENOENT")) {
          return done(utimesErr)
        }
        done(null, { skipped: false })
      })
    }

    if (fromStats.isSymbolicLink()) {
      if (!fromStats.targetPath) {
        return done(
          new InternalError({
            message: "Source is a symbolic link, but targetPath was null or undefined.",
          })
        )
      }

      // reproduce the symbolic link
      symlink(
        fromStats.targetPath,
        to,
        // relevant on windows
        // nodejs will auto-detect this on windows, but if the symlink is copied before the target then the auto-detection will get it wrong.
        fromStats.target?.isDirectory() ? "dir" : "file",
        (symlinkErr) => {
          if (symlinkErr) {
            return done(symlinkErr)
          }

          setUtimes()
        }
      )
    } else if (fromStats.isFile()) {
      // COPYFILE_FICLONE instructs the function to use a copy-on-write reflink on platforms/filesystems where available
      copyFile(from, to, constants.COPYFILE_FICLONE, (copyErr) => {
        if (copyErr) {
          return done(copyErr)
        }

        setUtimes()
      })
    } else {
      throw new InternalError({
        message: "Expected doClone source to be a file or a symbolic link.",
      })
    }
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
 *
 * This returns the paths in POSIX format.
 */
export async function scanDirectoryForClone(root: string, pattern?: string): Promise<MappedPaths> {
  // TODO: ignore symlinks that point outside of `root`!

  // No wildcards, so we just read and return the entire set of files from the source directory.
  if (!pattern) {
    return (
      await readdir.readdirAsync(root, {
        deep: true,
        sep: "/",
        filter: (stats) => stats.isFile() || stats.isSymbolicLink(),
      })
    ).map((f) => [f, f])
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
  await readdir.readdirAsync(root, {
    deep: true,
    sep: "/",
    filter: (stats) => {
      // See if this is a file within a previously matched directory
      // Note: `stats.path` is always POSIX formatted, relative to `sourceRoot`
      if (stats.isFile() || stats.isSymbolicLink()) {
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
        } else if (stats.isFile() || stats.isSymbolicLink()) {
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

interface StatsExtra {
  path: string
  target?: ExtendedStats | null
  // original relative or absolute path the symlink points to. This can be defined when target is null when the target does not exist, for instance.
  targetPath?: string | null
}

export type ExtendedStats = StatsBase<number> & StatsExtra

function makeExtendedStats({
  stats,
  path,
  target,
  targetPath,
}: {
  stats: fsExtra.Stats
} & StatsExtra): ExtendedStats {
  const o: StatsExtra = { path, target, targetPath }
  Object.assign(stats, o)
  return stats as ExtendedStats
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

type StatsCallback = (err: NodeJS.ErrnoException | null, stats: fsExtra.Stats) => void
type ExtendedStatsCallback = (err: NodeJS.ErrnoException | null, stats: ExtendedStats | null) => void
type ResolveSymlinkCallback = (params: {
  err: NodeJS.ErrnoException | null
  target: ExtendedStats | null
  targetPath: string | null
}) => void

/**
 * A helper class for getting information about files/dirs, that caches the stats for the lifetime of the class, and
 * provides some extended information, e.g. where a symlink resolves to and the stats on the target.
 * The idea is for an instance to be used for the duration of e.g. one sync flow, but not for longer.
 */
export class FileStatsHelper {
  private readonly lstatCache: { [path: string]: fsExtra.Stats }
  private readonly extendedStatCache: { [path: string]: ExtendedStats | null }

  constructor() {
    this.lstatCache = {}
    this.extendedStatCache = {}
  }

  /**
   * Calls fs.lstat on the given path, and caches the result.
   */
  lstat(path: string, cb: StatsCallback) {
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
          this.resolveSymlink(
            { path, allowAbsolute: allowAbsoluteSymlinks },
            ({ err: symlinkErr, target, targetPath }) => {
              cb(symlinkErr, makeExtendedStats({ stats: lstats, path, target, targetPath }))
            }
          )
        } else {
          cb(null, makeExtendedStats({ stats: lstats, path }))
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
   * The second callback parameter, `targetPath`, is the unresolved target of the symbolic link. The `targetPath` will be undefined
   * if the symbolic link is absolute, and absolute symbolic links are not allowed.
   *
   * `path` must be an absolute path (an error is thrown otherwise).
   *
   * By default, absolute symlinks are ignored, and if one is encountered the method resolves to null. Set
   * `allowAbsolute: true` to allow absolute symlinks.
   */
  resolveSymlink(params: ResolveSymlinkParams, cb: ResolveSymlinkCallback) {
    const { path, allowAbsolute } = params
    const _resolvedPaths = params._resolvedPaths || [path]

    this.assertAbsolute(path)

    // Get the link target path
    // Note: We're not using realpath here because we need to be able to assert than symlinks aren't absolute
    readlink(path, (readlinkErr, target) => {
      if (readlinkErr?.code === "ENOENT") {
        // Symlink target not found, so we ignore it
        return cb({ err: null, target: null, targetPath: null })
      } else if (readlinkErr) {
        return cb({
          err: InternalError.wrapError(readlinkErr, "Error reading symlink"),
          target: null,
          targetPath: null,
        })
      }

      // Ignore absolute symlinks unless specifically allowed
      // TODO: also allow limiting links to a certain absolute path
      if (isAbsolute(target) && !allowAbsolute) {
        return cb({ err: null, target: null, targetPath: null })
      }

      // Resolve the symlink path
      const absoluteTarget = resolve(parse(path).dir, target)

      // Stat the final path and return
      this.lstat(absoluteTarget, (statErr, toStats) => {
        if (statErr?.code === "ENOENT") {
          // The symlink target does not exist. That's not an error.
          cb({ err: null, target: null, targetPath: target })
        } else if (statErr) {
          // Propagate other errors
          cb({ err: statErr, target: null, targetPath: null })
        } else if (toStats.isSymbolicLink()) {
          // Keep resolving until we get to a real path
          if (_resolvedPaths.includes(absoluteTarget)) {
            // We've gone into a symlink loop, so we ignore it
            cb({ err: null, target: null, targetPath: target })
          } else {
            this.resolveSymlink(
              { path: absoluteTarget, allowAbsolute, _resolvedPaths: [..._resolvedPaths, absoluteTarget] },
              ({ err: innerResolveErr, target: innerStats, targetPath: _innerTarget }) => {
                if (innerResolveErr) {
                  cb({ err: innerResolveErr, target: null, targetPath: null })
                } else {
                  // make sure the original symlink target is not overridden by the recursive search here
                  // TODO(0.15): In a future version of garden it would be better to simply reproduce relative symlinks, instead of resolving them and copying the target directories.
                  cb({ err: null, target: innerStats, targetPath: target })
                }
              }
            )
          }
        } else {
          // Return with path and stats for final symlink target
          cb({
            err: null,
            target: makeExtendedStats({ stats: toStats, path: absoluteTarget }),
            targetPath: target,
          })
        }
      })
    })
  }

  private assertAbsolute(path: string) {
    if (!isAbsolute(path)) {
      throw new InternalError({ message: `Must specify absolute path (got ${path})` })
    }
  }
}
