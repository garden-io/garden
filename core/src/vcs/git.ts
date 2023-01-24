/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { performance } from "perf_hooks"
import { isAbsolute, join, posix, relative, resolve } from "path"
import { isString } from "lodash"
import { createReadStream, ensureDir, lstat, pathExists, readlink, realpath, stat, Stats } from "fs-extra"
import { PassThrough } from "stream"
import { GetFilesParams, RemoteSourceParams, VcsFile, VcsHandler, VcsInfo } from "./vcs"
import { ConfigurationError, RuntimeError } from "../exceptions"
import Bluebird from "bluebird"
import { getStatsType, joinWithPosix, matchPath } from "../util/fs"
import { dedent, deline } from "../util/string"
import { exec, splitLast } from "../util/util"
import { LogEntry } from "../logger/log-entry"
import parseGitConfig from "parse-git-config"
import { getDefaultProfiler, Profile, Profiler } from "../util/profiling"
import { mapLimit } from "async"
import { TreeCache } from "../cache"
import { STATIC_DIR } from "../constants"
import split2 = require("split2")
import execa = require("execa")
import isGlob = require("is-glob")
import chalk = require("chalk")
import hasha = require("hasha")
import { pMemoizeDecorator } from "../lib/p-memoize"

const AsyncLock = require("async-lock")
const gitConfigAsyncLock = new AsyncLock()

const submoduleErrorSuggestion = `Perhaps you need to run ${chalk.underline(`git submodule update --recursive`)}?`
const hashConcurrencyLimit = 50
const currentPlatformName = process.platform

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
        (e.g. https://github.com/org/repo.git#main)`,
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

interface FileEntry {
  path: string
  hash: string
}

// TODO Consider moving git commands to separate (and testable) functions
@Profile()
export class GitHandler extends VcsHandler {
  name = "git"
  repoRoots = new Map()
  profiler: Profiler
  private readonly gitSafeDirs: Set<string>
  private gitSafeDirsRead: boolean

  constructor(...args: [string, string, string, TreeCache]) {
    super(...args)
    this.profiler = getDefaultProfiler()
    this.gitSafeDirs = new Set<string>()
    this.gitSafeDirsRead = false
  }

  gitCli(log: LogEntry, cwd: string, failOnPrompt = false): GitCli {
    return async (...args: (string | undefined)[]) => {
      log.silly(`Calling git with args '${args.join(" ")}' in ${cwd}`)
      const { stdout } = await exec("git", args.filter(isString), {
        cwd,
        maxBuffer: 10 * 1024 * 1024,
        env: failOnPrompt ? { GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "true" } : undefined,
      })
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

  toGitConfigCompatiblePath(path: string, platformName: string): string {
    // Windows paths require some pre-processing,
    // see the full list of platform names here: https://nodejs.org/api/process.html#process_process_platform
    if (platformName !== "win32") {
      return path
    }

    // Replace back-slashes with forward-slashes to make paths compatible with .gitconfig in Windows
    return path.replace(/\\/g, "/")
  }

  /**
   * Checks if a given {@code path} is a valid and safe Git repository.
   * If it is a valid Git repository owned by another user,
   * then the static dir will be added to the list of safe directories in .gitconfig.
   *
   * Git has stricter repository ownerships checks since 2.36.0,
   * see https://github.blog/2022-04-18-highlights-from-git-2-36/ for more details.
   */
  private async ensureSafeDirGitRepo(log: LogEntry, path: string, failOnPrompt = false): Promise<void> {
    if (this.gitSafeDirs.has(path)) {
      return
    }

    const git = this.gitCli(log, path, failOnPrompt)

    if (!this.gitSafeDirsRead) {
      await gitConfigAsyncLock.acquire(".gitconfig", async () => {
        if (!this.gitSafeDirsRead) {
          const gitCli = this.gitCli(log, path, failOnPrompt)
          try {
            const safeDirectories = await gitCli("config", "--get-all", "safe.directory")
            safeDirectories.forEach((safeDir) => this.gitSafeDirs.add(safeDir))
          } catch (err) {
            // ignore the error if there are no safe directories defined
            log.debug(`Error reading safe directories from the .gitconfig: ${err}`)
          }
          this.gitSafeDirsRead = true
        }
      })
    }

    try {
      await git("status")
      this.gitSafeDirs.add(path)
    } catch (err) {
      // Git has stricter repo ownerships checks since 2.36.0
      if (err.exitCode === 128 && err.stderr?.toLowerCase().includes("fatal: unsafe repository")) {
        log.warn(
          chalk.yellow(
            `It looks like you're using Git 2.36.0 or newer and the directory "${path}" is owned by someone else. It will be added to safe.directory list in the .gitconfig.`
          )
        )

        if (!this.gitSafeDirs.has(path)) {
          await gitConfigAsyncLock.acquire(".gitconfig", async () => {
            if (!this.gitSafeDirs.has(path)) {
              const gitConfigCompatiblePath = this.toGitConfigCompatiblePath(path, currentPlatformName)
              // Add the safe directory globally to be able to run git command outside a (trusted) git repo
              // Wrap the path in quotes to pass it as a single argument in case if it contains any whitespaces
              await git("config", "--global", "--add", "safe.directory", `'${gitConfigCompatiblePath}'`)
              this.gitSafeDirs.add(path)
              log.debug(`Configured git to trust repository in ${path}`)
            }
          })
        }

        return
      } else if (err.exitCode === 128 && err.stderr?.toLowerCase().includes("fatal: not a git repository")) {
        throw new RuntimeError(notInRepoRootErrorMessage(path), { path })
      } else {
        log.error(
          `Unexpected Git error occurred while running 'git status' from path "${path}". Exit code: ${err.exitCode}. Error message: ${err.stderr}`
        )
        throw err
      }
    }
    this.gitSafeDirs.add(path)
  }

  async getRepoRoot(log: LogEntry, path: string, failOnPrompt = false) {
    if (this.repoRoots.has(path)) {
      return this.repoRoots.get(path)
    }

    await this.ensureSafeDirGitRepo(log, STATIC_DIR, failOnPrompt)
    await this.ensureSafeDirGitRepo(log, path, failOnPrompt)

    const git = this.gitCli(log, path, failOnPrompt)

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
    failOnPrompt = false,
  }: GetFilesParams): Promise<VcsFile[]> {
    if (include && include.length === 0) {
      // No need to proceed, nothing should be included
      return []
    }

    log = log.debug(
      `Scanning ${pathDescription} at ${path}\n→ Includes: ${include || "(none)"}\n→ Excludes: ${exclude || "(none)"}`
    )

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

    const git = this.gitCli(log, path, failOnPrompt)
    const gitRoot = await this.getRepoRoot(log, path, failOnPrompt)

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
    const trackedButIgnored = new Set(
      !this.ignoreFile
        ? []
        : await git("ls-files", "--ignored", ...lsFilesCommonArgs, "--exclude-per-directory", this.ignoreFile)
    )

    // List all submodule paths in the current path
    const submodules = await this.getSubmodules(path)
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

    const splitStream = split2()
    splitStream.on("data", (line) => handleEntry(parseLine(line)))

    await new Promise<void>((_resolve, _reject) => {
      const proc = lsFiles(this.ignoreFile)
      proc.on("error", (err: execa.ExecaError) => {
        if (err.exitCode !== 128) {
          _reject(err)
        }
      })
      proc.stdout?.pipe(splitStream)
      splitStream.on("end", () => _resolve())
    })

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
    const _this = this

    function ensureHash(entry: FileEntry, stats: Stats, cb: (err: Error | null, entry?: FileEntry) => void) {
      if (entry.hash === "" || modified.has(entry.path)) {
        // Don't attempt to hash directories. Directories will by extension be filtered out of the list.
        if (!stats.isDirectory()) {
          return _this.hashObject(stats, entry.path, (err, hash) => {
            if (err) {
              return cb(err)
            }
            entry.hash = hash || ""
            cb(null, entry)
          })
        }
      }

      cb(null, entry)
    }

    const result = (
      await mapLimit<VcsFile, FileEntry>(files, hashConcurrencyLimit, (f, cb) => {
        const resolvedPath = resolve(path, f.path)
        const output = { path: resolvedPath, hash: f.hash || "" }

        lstat(resolvedPath, (err, stats) => {
          if (err) {
            if (err.code === "ENOENT") {
              return cb(null, { path: resolvedPath, hash: "" })
            }
            return cb(err)
          }

          // We need to special-case handling of symlinks. We disallow any "unsafe" symlinks, i.e. any ones that may
          // link outside of `gitRoot`.
          if (stats.isSymbolicLink()) {
            readlink(resolvedPath, (readlinkErr, target) => {
              if (readlinkErr) {
                return cb(readlinkErr)
              }

              // Make sure symlink is relative and points within `path`
              if (isAbsolute(target)) {
                log.verbose(`Ignoring symlink with absolute target at ${resolvedPath}`)
                return cb(null, { path: resolvedPath, hash: "" })
              } else if (target.startsWith("..")) {
                realpath(resolvedPath, (realpathErr, realTarget) => {
                  if (realpathErr) {
                    if (realpathErr.code === "ENOENT") {
                      return cb(null, { path: resolvedPath, hash: "" })
                    }
                    return cb(err)
                  }

                  const relPath = relative(path, realTarget)

                  if (relPath.startsWith("..")) {
                    log.verbose(`Ignoring symlink pointing outside of ${pathDescription} at ${resolvedPath}`)
                    return cb(null, { path: resolvedPath, hash: "" })
                  }
                  ensureHash(output, stats, cb)
                })
              } else {
                ensureHash(output, stats, cb)
              }
            })
          } else {
            ensureHash(output, stats, cb)
          }
        })
      })
    ).filter((f) => f.hash !== "")

    log.debug(`Found ${result.length} files in ${pathDescription} ${path}`)

    return result
  }

  private isHashSHA1(hash: string): boolean {
    const SHA1RegExp = new RegExp(/\b([a-f0-9]{40})\b/)
    return SHA1RegExp.test(hash)
  }

  private async cloneRemoteSource(
    log: LogEntry,
    repositoryUrl: string,
    hash: string,
    absPath: string,
    failOnPrompt = false
  ) {
    await ensureDir(absPath)
    const git = this.gitCli(log, absPath, failOnPrompt)
    // Use `--recursive` to include submodules
    if (!this.isHashSHA1(hash)) {
      return git("clone", "--recursive", "--depth=1", "--shallow-submodules", `--branch=${hash}`, repositoryUrl, ".")
    }

    // If SHA1 is used we need to fetch the changes as git clone doesn't allow to shallow clone
    // a specific hash
    try {
      await git("init")
      await git("remote", "add", "origin", repositoryUrl)
      await git("fetch", "--depth=1", "--recurse-submodules=yes", "origin", hash)
      await git("checkout", "FETCH_HEAD")
      return git("submodule", "update", "--init", "--recursive")
    } catch (err) {
      throw new RuntimeError(
        dedent`Failed to shallow clone with error: \n\n${err}
      Make sure both git client and server are newer than 2.5.0 and that \`uploadpack.allowReachableSHA1InWant=true\`
      is set on the server`,
        {
          message: err.message,
        }
      )
    }
  }

  // TODO Better auth handling
  async ensureRemoteSource({ url, name, log, sourceType, failOnPrompt = false }: RemoteSourceParams): Promise<string> {
    const remoteSourcesPath = join(this.gardenDirPath, this.getRemoteSourcesDirname(sourceType))
    await ensureDir(remoteSourcesPath)

    const absPath = join(this.gardenDirPath, this.getRemoteSourceRelPath(name, url, sourceType))
    const isCloned = await pathExists(absPath)

    if (!isCloned) {
      const entry = log.info({ section: name, msg: `Fetching from ${url}`, status: "active" })
      const { repositoryUrl, hash } = parseGitUrl(url)

      try {
        await this.cloneRemoteSource(log, repositoryUrl, hash, absPath, failOnPrompt)
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

  async updateRemoteSource({ url, name, sourceType, log, failOnPrompt = false }: RemoteSourceParams) {
    const absPath = join(this.gardenDirPath, this.getRemoteSourceRelPath(name, url, sourceType))
    const git = this.gitCli(log, absPath, failOnPrompt)
    const { repositoryUrl, hash } = parseGitUrl(url)

    await this.ensureRemoteSource({ url, name, sourceType, log, failOnPrompt })

    const entry = log.info({ section: name, msg: "Getting remote state", status: "active" })
    await git("remote", "update")

    const localCommitId = (await git("rev-parse", "HEAD"))[0]
    const remoteCommitId = this.isHashSHA1(hash)
      ? hash
      : getCommitIdFromRefList(await git("ls-remote", repositoryUrl, hash))

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
  hashObject(stats: Stats, path: string, cb: (err: Error | null, hash: string) => void) {
    const start = performance.now()
    const hash = hasha.stream({ algorithm: "sha1" })

    if (stats.isSymbolicLink()) {
      // For symlinks, we follow git's behavior, which is to hash the link itself (i.e. the path it contains) as
      // opposed to the file/directory that it points to.
      readlink(path, (err, linkPath) => {
        if (err) {
          // Ignore errors here, just output empty h°ash
          this.profiler.log("GitHandler#hashObject", start)
          return cb(null, "")
        }
        hash.update(`blob ${stats.size}\0${linkPath}`)
        hash.end()
        const output = hash.read()
        this.profiler.log("GitHandler#hashObject", start)
        cb(null, output)
      })
    } else {
      const stream = new PassThrough()
      stream.push(`blob ${stats.size}\0`)

      stream
        .on("error", () => {
          // Ignore file read error
          this.profiler.log("GitHandler#hashObject", start)
          cb(null, "")
        })
        .pipe(hash)
        .on("error", cb)
        .on("finish", () => {
          const output = hash.read()
          this.profiler.log("GitHandler#hashObject", start)
          cb(null, output)
        })

      createReadStream(path).pipe(stream)
    }
  }

  @pMemoizeDecorator()
  private async getSubmodules(gitModulesConfigPath: string) {
    const submodules: Submodule[] = []
    const gitmodulesPath = join(gitModulesConfigPath, ".gitmodules")

    if (await pathExists(gitmodulesPath)) {
      const parsed = await parseGitConfig({ cwd: gitModulesConfigPath, path: ".gitmodules" })

      for (const [key, spec] of Object.entries(parsed || {}) as any) {
        if (!key.startsWith("submodule")) {
          continue
        }
        spec.path && submodules.push(spec)
      }
    }

    return submodules
  }

  async getPathInfo(log: LogEntry, path: string, failOnPrompt = false): Promise<VcsInfo> {
    const git = this.gitCli(log, path, failOnPrompt)

    const output: VcsInfo = {
      branch: "",
      commitHash: "",
      originUrl: "",
    }

    try {
      output.branch = (await git("rev-parse", "--abbrev-ref", "HEAD"))[0]
      output.commitHash = (await git("rev-parse", "HEAD"))[0]
    } catch (err) {
      if (err.exitCode !== 128) {
        throw err
      }
    }

    try {
      output.originUrl = (await git("config", "--get", "remote.origin.url"))[0]
    } catch (err) {
      // Just ignore if not available
      log.silly(`Tried to retrieve git remote.origin.url but encountered an error: ${err}`)
    }

    return output
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
