/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import FilterStream from "streamfilter"
import { join, resolve, relative, isAbsolute, posix } from "path"
import { flatten, isString } from "lodash"
import { ensureDir, pathExists, createReadStream, Stats, realpath, readlink, lstat, stat } from "fs-extra"
import { PassThrough, Transform } from "stream"
import hasha from "hasha"
import split2 = require("split2")
import { VcsHandler, RemoteSourceParams, VcsFile, GetFilesParams } from "./vcs"
import { ConfigurationError, RuntimeError } from "../exceptions"
import Bluebird from "bluebird"
import { getStatsType, joinWithPosix, matchPath } from "../util/fs"
import { deline } from "../util/string"
import { splitLast, exec } from "../util/util"
import { LogEntry } from "../logger/log-entry"
import parseGitConfig from "parse-git-config"
import { Profile } from "../util/profiling"
import { SortedStreamIntersection } from "../util/streams"
import execa = require("execa")
import isGlob = require("is-glob")
import chalk = require("chalk")

const submoduleErrorSuggestion = `Perhaps you need to run ${chalk.underline(`git submodule update --recursive`)}?`

export function getCommitIdFromRefList(refList: string[]): string {
  try {
    return refList[0].split("\t")[0]
  } catch (err) {
    return refList[0]
  }
}

export function parseGitUrl(url: string) {
  const parts = splitLast(url, "#")
  if (!parts[0]) {
    throw new ConfigurationError(
      deline`
        Repository URLs must contain a hash part pointing to a specific branch or tag
        (e.g. https://github.com/org/repo.git#master)`,
      { repositoryUrl: url }
    )
  }
  const parsed = { repositoryUrl: parts[0], hash: parts[1] }
  return parsed
}

interface GitCli {
  (...args: (string | undefined)[]): Promise<string[]>
}

interface Submodule {
  path: string
  url: string
}

// TODO Consider moving git commands to separate (and testable) functions
@Profile()
export class GitHandler extends VcsHandler {
  name = "git"
  repoRoots = new Map()

  gitCli(log: LogEntry, cwd: string): GitCli {
    return async (...args: (string | undefined)[]) => {
      log.silly(`Calling git with args '${args.join(" ")}' in ${cwd}`)
      const { stdout } = await exec("git", args.filter(isString), { cwd, maxBuffer: 10 * 1024 * 1024 })
      return stdout.split("\n").filter((line) => line.length > 0)
    }
  }

  private async getModifiedFiles(git: GitCli, path: string) {
    try {
      return await git("diff-index", "--name-only", "HEAD", path)
    } catch (err) {
      if (err.exitCode === 128) {
        // no commit in repo
        return []
      } else {
        throw err
      }
    }
  }

  async getRepoRoot(log: LogEntry, path: string) {
    if (this.repoRoots.has(path)) {
      return this.repoRoots.get(path)
    }
    const git = this.gitCli(log, path)

    try {
      const repoRoot = (await git("rev-parse", "--show-toplevel"))[0]
      this.repoRoots.set(path, repoRoot)
      return repoRoot
    } catch (err) {
      if (err.exitCode === 128) {
        // Throw nice error when we detect that we're not in a repo root
        throw new RuntimeError(notInRepoRootErrorMessage(path), { path })
      } else {
        throw err
      }
    }
  }

  /**
   * Returns a list of files, along with file hashes, under the given path, taking into account the configured
   * .ignore files, and the specified include/exclude filters.
   */
  async getFiles({
    log,
    path,
    pathDescription = "directory",
    include,
    exclude,
    filter,
  }: GetFilesParams): Promise<VcsFile[]> {
    if (include && include.length === 0) {
      // No need to proceed, nothing should be included
      return []
    }

    log = log.debug(`Scanning ${pathDescription} at ${path}\nIncludes: ${include}\nExcludes:${exclude}`)

    try {
      const pathStats = await stat(path)

      if (!pathStats.isDirectory()) {
        log.warn({
          symbol: "warning",
          msg: chalk.gray(`Expected directory at ${path}, but found ${getStatsType(pathStats)}.`),
        })
        return []
      }
    } catch (err) {
      // 128 = File no longer exists
      if (err.exitCode === 128 || err.code === "ENOENT") {
        log.warn({
          symbol: "warning",
          msg: chalk.gray(`Attempted to scan directory at ${path}, but it does not exist.`),
        })
        return []
      } else {
        throw err
      }
    }

    const git = this.gitCli(log, path)
    const gitRoot = await this.getRepoRoot(log, path)

    // List modified files, so that we can ensure we have the right hash for them later
    const modified = new Set(
      (await this.getModifiedFiles(git, path))
        // The output here is relative to the git root, and not the directory `path`
        .map((modifiedRelPath) => resolve(gitRoot, modifiedRelPath))
    )

    const absExcludes = exclude ? exclude.map((p) => resolve(path, p)) : undefined

    // Apply the include patterns to the ls-files queries. We use the 'glob' "magic word" (in git parlance)
    // to make sure the path handling is consistent with normal POSIX-style globs used generally by Garden.
    // Note: We unfortunately can't exclude at this level because it simply doesn't work in git, for reasons unknown.
    const patterns = [...(include || []).map((p) => ":(glob)" + p)]
    const lsFilesCommonArgs = ["--cached", "--exclude", this.gardenDirPath]

    // List tracked but ignored files (we currently exclude those as well, so we need to query that specially)
    // TODO: change in 0.13 to no longer exclude these
    const trackedButIgnored = new Set(
      this.ignoreFiles.length === 0
        ? []
        : flatten(
            await Promise.all(
              this.ignoreFiles.map((f) =>
                git("ls-files", "--ignored", ...lsFilesCommonArgs, "--exclude-per-directory", f)
              )
            )
          )
    )

    // List all submodule paths in the current repo
    const submodules = await this.getSubmodules(gitRoot)
    const submodulePaths = submodules.map((s) => join(gitRoot, s.path))
    if (submodules.length > 0) {
      log.silly(`Submodules listed at ${submodules.map((s) => `${s.path} (${s.url})`).join(", ")}`)
    }

    const files: VcsFile[] = []

    const parseLine = (data: Buffer): VcsFile | undefined => {
      const line = data.toString().trim()
      if (!line) {
        return undefined
      }

      let filePath: string
      let hash = ""

      const split = line.trim().split("\t")

      if (split.length === 1) {
        // File is untracked
        filePath = split[0]
      } else {
        filePath = split[1]
        hash = split[0].split(" ")[1]
      }

      return { path: filePath, hash }
    }

    // This function is called for each line output from the ls-files commands that we run, and populates the
    // `files` array.
    const handleEntry = (entry: VcsFile | undefined) => {
      if (!entry) {
        return
      }

      let { path: filePath, hash } = entry

      // Check filter function, if provided
      if (filter && !filter(filePath)) {
        return
      }

      // Ignore files that are tracked but still specified in ignore files
      if (trackedButIgnored.has(filePath)) {
        return
      }

      const resolvedPath = resolve(path, filePath)

      // We push to the output array if it passes through the exclude filters.
      if (matchPath(filePath, undefined, exclude) && !submodulePaths.includes(resolvedPath)) {
        files.push({ path: resolvedPath, hash })
      }
    }

    const lsFiles = (ignoreFile?: string) => {
      const args = ["ls-files", "-s", "--others", ...lsFilesCommonArgs]

      if (ignoreFile) {
        args.push("--exclude-per-directory", ignoreFile)
      }
      args.push(...patterns)

      log.silly(`Calling git with args '${args.join(" ")}' in ${path}`)
      return execa("git", args, { cwd: path, buffer: false })
    }

    if (this.ignoreFiles.length > 1) {
      // We run ls-files for each ignore file and do a streaming set-intersection (i.e. every ls-files call
      // needs to "agree" that a file should be included). Then `handleLine()` is called for each resulting entry.
      const streams = this.ignoreFiles.map(() => {
        const input = split2()
        const output = input.pipe(
          new FilterStream((line: Buffer, _, cb) => {
            cb(!!line)
          }).pipe(
            new Transform({
              objectMode: true,
              transform(line: Buffer, _, cb: Function) {
                this.push(parseLine(line))
                cb()
              },
            })
          )
        )
        return { input, output }
      })

      await new Promise<void>((_resolve, _reject) => {
        // Note: The comparison function needs to account for git first returning untracked files, so we prefix with
        // a zero or one to indicate whether it's a tracked file or not, and then do a simple string comparison
        const intersection = new SortedStreamIntersection(
          streams.map(({ output }) => output),
          (a: VcsFile, b: VcsFile) => {
            const cmpA = (a.hash ? "1" : "0") + a.path
            const cmpB = (b.hash ? "1" : "0") + b.path
            return <any>(cmpA > cmpB) - <any>(cmpA < cmpB)
          }
        )

        this.ignoreFiles.map((ignoreFile, i) => {
          const proc = lsFiles(ignoreFile)

          proc.on("error", (err) => {
            if (err["exitCode"] !== 128) {
              _reject(err)
            }
          })

          proc.stdout!.pipe(streams[i].input)
        })

        intersection.on("data", handleEntry)
        intersection.on("error", (err) => {
          _reject(err)
        })
        intersection.on("end", () => {
          _resolve()
        })
      })
    } else {
      const splitStream = split2()
      splitStream.on("data", (line) => handleEntry(parseLine(line)))

      await new Promise<void>((_resolve, _reject) => {
        const proc = lsFiles(this.ignoreFiles[0])
        proc.on("error", (err: execa.ExecaError) => {
          if (err.exitCode !== 128) {
            _reject(err)
          }
        })
        proc.stdout?.pipe(splitStream)
        splitStream.on("end", () => _resolve())
      })
    }

    if (submodulePaths.length > 0) {
      // Need to automatically add `**/*` to directory paths, to match git behavior when filtering.
      const augmentedIncludes = await augmentGlobs(path, include)
      const augmentedExcludes = await augmentGlobs(path, exclude)

      // Resolve submodules
      // TODO: see about optimizing this, avoiding scans when we're sure they'll not match includes/excludes etc.
      await Bluebird.map(submodulePaths, async (submodulePath) => {
        if (submodulePath.startsWith(path) && !absExcludes?.includes(submodulePath)) {
          // Note: We apply include/exclude filters after listing files from submodule
          const submoduleRelPath = relative(path, submodulePath)

          // Catch and show helpful message in case the submodule path isn't a valid directory
          try {
            const pathStats = await stat(path)

            if (!pathStats.isDirectory()) {
              const pathType = getStatsType(pathStats)
              log.warn({
                symbol: "warning",
                msg: chalk.gray(
                  `Expected submodule directory at ${path}, but found ${pathType}. ${submoduleErrorSuggestion}`
                ),
              })
              return
            }
          } catch (err) {
            // 128 = File no longer exists
            if (err.exitCode === 128 || err.code === "ENOENT") {
              log.warn({
                symbol: "warning",
                msg: chalk.yellow(
                  `Found reference to submodule at ${submoduleRelPath}, but the path could not be found. ${submoduleErrorSuggestion}`
                ),
              })
              return
            } else {
              throw err
            }
          }

          files.push(
            ...(await this.getFiles({
              log,
              path: submodulePath,
              pathDescription: "submodule",
              exclude: [],
              filter: (p) => matchPath(join(submoduleRelPath, p), augmentedIncludes, augmentedExcludes),
            }))
          )
        }
      })
    }

    // Make sure we have a fresh hash for each file
    const result = await Bluebird.map(files, async (f) => {
      const resolvedPath = resolve(path, f.path)
      let output = { path: resolvedPath, hash: f.hash || "" }
      let stats: Stats

      try {
        stats = await lstat(resolvedPath)
      } catch (err) {
        // 128 = File no longer exists
        if (err.exitCode === 128 || err.code === "ENOENT") {
          // If the file is gone, we filter it out below
          return { path: resolvedPath, hash: "" }
        } else {
          throw err
        }
      }

      // We need to special-case handling of symlinks. We disallow any "unsafe" symlinks, i.e. any ones that may
      // link outside of `gitRoot`.
      if (stats.isSymbolicLink()) {
        const target = await readlink(resolvedPath)

        // Make sure symlink is relative and points within `path`
        if (isAbsolute(target)) {
          log.verbose(`Ignoring symlink with absolute target at ${resolvedPath}`)
          output.hash = ""
          return output
        } else if (target.startsWith("..")) {
          let realTarget: string

          try {
            realTarget = await realpath(resolvedPath)
          } catch (err) {
            if (err.code === "ENOENT") {
              // Link can't be resolved, so we ignore it
              return { path: resolvedPath, hash: "" }
            } else {
              throw err
            }
          }

          const relPath = relative(path, realTarget)

          if (relPath.startsWith("..")) {
            log.verbose(`Ignoring symlink pointing outside of ${pathDescription} at ${resolvedPath}`)
            output.hash = ""
            return output
          }
        }
      }

      if (output.hash === "" || modified.has(resolvedPath)) {
        // Don't attempt to hash directories. Directories will by extension be filtered out of the list.
        if (!stats.isDirectory()) {
          output.hash = (await this.hashObject(stats, resolvedPath)) || ""
        }
      }

      return output
    }).filter((f) => f.hash !== "")

    log.debug(`Found ${result.length} files in ${pathDescription} ${path}`)

    return result
  }

  private async cloneRemoteSource(
    log: LogEntry,
    remoteSourcesPath: string,
    repositoryUrl: string,
    hash: string,
    absPath: string
  ) {
    const git = this.gitCli(log, remoteSourcesPath)
    // Use `--recursive` to include submodules
    return git("clone", "--recursive", "--depth=1", `--branch=${hash}`, repositoryUrl, absPath)
  }

  // TODO Better auth handling
  async ensureRemoteSource({ url, name, log, sourceType }: RemoteSourceParams): Promise<string> {
    const remoteSourcesPath = join(this.gardenDirPath, this.getRemoteSourcesDirname(sourceType))
    await ensureDir(remoteSourcesPath)

    const absPath = join(this.gardenDirPath, this.getRemoteSourceRelPath(name, url, sourceType))
    const isCloned = await pathExists(absPath)

    if (!isCloned) {
      const entry = log.info({ section: name, msg: `Fetching from ${url}`, status: "active" })
      const { repositoryUrl, hash } = parseGitUrl(url)

      try {
        await this.cloneRemoteSource(log, remoteSourcesPath, repositoryUrl, hash, absPath)
      } catch (err) {
        entry.setError()
        throw new RuntimeError(`Downloading remote ${sourceType} failed with error: \n\n${err}`, {
          repositoryUrl: url,
          message: err.message,
        })
      }

      entry.setSuccess()
    }

    return absPath
  }

  async updateRemoteSource({ url, name, sourceType, log }: RemoteSourceParams) {
    const absPath = join(this.gardenDirPath, this.getRemoteSourceRelPath(name, url, sourceType))
    const git = this.gitCli(log, absPath)
    const { repositoryUrl, hash } = parseGitUrl(url)

    await this.ensureRemoteSource({ url, name, sourceType, log })

    const entry = log.info({ section: name, msg: "Getting remote state", status: "active" })
    await git("remote", "update")

    const remoteCommitId = getCommitIdFromRefList(await git("ls-remote", repositoryUrl, hash))
    const localCommitId = getCommitIdFromRefList(await git("show-ref", "--hash", hash))

    if (localCommitId !== remoteCommitId) {
      entry.setState(`Fetching from ${url}`)

      try {
        await git("fetch", "--depth=1", "origin", hash)
        await git("reset", "--hard", `origin/${hash}`)
        // Update submodules if applicable (no-op if no submodules in repo)
        await git("submodule", "update", "--recursive")
      } catch (err) {
        entry.setError()
        throw new RuntimeError(`Updating remote ${sourceType} failed with error: \n\n${err}`, {
          repositoryUrl: url,
          message: err.message,
        })
      }

      entry.setSuccess("Source updated")
    } else {
      entry.setSuccess("Source already up to date")
    }
  }

  /**
   * Replicates the `git hash-object` behavior. See https://stackoverflow.com/a/5290484/3290965
   * We deviate from git's behavior when dealing with symlinks, by hashing the target of the symlink and not the
   * symlink itself. If the symlink cannot be read, we hash the link contents like git normally does.
   */
  async hashObject(stats: Stats, path: string) {
    const stream = new PassThrough()
    const output = hasha.fromStream(stream, { algorithm: "sha1" })
    stream.push(`blob ${stats.size}\0`)

    if (stats.isSymbolicLink()) {
      // For symlinks, we follow git's behavior, which is to hash the link itself (i.e. the path it contains) as
      // opposed to the file/directory that it points to.
      stream.push(await readlink(path))
      stream.end()
    } else {
      createReadStream(path).pipe(stream)
    }

    return output
  }

  private async getSubmodules(gitRoot: string) {
    const submodules: Submodule[] = []
    const gitmodulesPath = join(gitRoot, ".gitmodules")

    if (await pathExists(gitmodulesPath)) {
      const parsed = await parseGitConfig({ cwd: gitRoot, path: ".gitmodules" })

      for (const [key, spec] of Object.entries(parsed || {}) as any) {
        if (!key.startsWith("submodule")) {
          continue
        }
        spec.path && submodules.push(spec)
      }
    }

    return submodules
  }

  async getOriginName(log: LogEntry) {
    const cwd = process.cwd()
    const git = this.gitCli(log, cwd)
    try {
      return (await git("config", "--get", "remote.origin.url"))[0]
    } catch (error) {
      log.silly(`Trying to retrieve "git remote origin.url" but encountered an error: ${error}`)
    }
    return undefined
  }

  async getBranchName(log: LogEntry, path: string): Promise<string | undefined> {
    const git = this.gitCli(log, path)
    try {
      return (await git("rev-parse", "--abbrev-ref", "HEAD"))[0]
    } catch (err) {
      if (err.exitCode === 128) {
        // If this doesn't throw, then we're in a repo with no commits, or with a detached HEAD.
        await this.getRepoRoot(log, path)
        return undefined
      } else {
        throw err
      }
    }
  }
}

const notInRepoRootErrorMessage = (path: string) => deline`
    Path ${path} is not in a git repository root. Garden must be run from within a git repo.
    Please run \`git init\` if you're starting a new project and repository, or move the project to an
    existing repository, and try again.
  `

/**
 * Given a list of POSIX-style globs/paths and a `basePath`, find paths that point to a directory and append `**\/*`
 * to them, such that they'll be matched consistently between git and our internal pattern matching.
 */
async function augmentGlobs(basePath: string, globs?: string[]) {
  if (!globs) {
    return globs
  }

  return Bluebird.map(globs, async (pattern) => {
    if (isGlob(pattern, { strict: false })) {
      // Pass globs through directly (they won't match a specific directory)
      return pattern
    }

    try {
      const isDir = (await stat(joinWithPosix(basePath, pattern))).isDirectory()
      return isDir ? posix.join(pattern, "**/*") : pattern
    } catch {
      return pattern
    }
  })
}
