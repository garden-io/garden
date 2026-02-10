/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Profile } from "../util/profiling.js"
import { getStatsType, matchPath } from "../util/fs.js"
import { isErrnoException } from "../exceptions.js"
import { dirname, isAbsolute, join, normalize, relative, resolve } from "path"
import fsExtra from "fs-extra"
import PQueue from "p-queue"
import { defer } from "../util/util.js"
import { execa, type ExecaError } from "execa"
import split2 from "split2"
import { pMemoizeDecorator } from "../lib/p-memoize.js"
import { AbstractGitHandler, augmentGlobs, GitCli, hashObject } from "./git.js"
import type {
  BaseIncludeExcludeFiles,
  GetFilesParams,
  IncludeExcludeFilesHandler,
  VcsFile,
  VcsHandlerParams,
} from "./vcs.js"
import { styles } from "../logger/styles.js"
import type { Log } from "../logger/log-entry.js"
import dedent from "dedent"
import { gardenEnv } from "../constants.js"
import { parse as parseIni } from "ini"
import { renderDuration } from "../logger/util.js"

const { pathExists, readFile, readlink, lstat } = fsExtra

const submoduleErrorSuggestion = `Perhaps you need to run ${styles.underline(`git submodule update --recursive`)}?`

interface GitEntry {
  path: string
  hash: string
  mode: string
}

interface GitSubTreeIncludeExcludeFiles extends BaseIncludeExcludeFiles {
  hasIncludes: boolean
}

const getIncludeExcludeFiles: IncludeExcludeFilesHandler<GetFilesParams, GitSubTreeIncludeExcludeFiles> = async (
  params: GetFilesParams
) => {
  let include = params.include

  // We apply the include patterns to the `ls-files` queries. We use the `--glob-pathspecs` flag
  // to make sure the path handling is consistent with normal POSIX-style globs used generally by Garden.

  // Due to an issue in git, we can unfortunately only use _either_ include or exclude patterns in the
  // `ls-files` commands, but not both. Trying both just ignores the exclude patterns.
  if (include?.includes("**/*")) {
    // This is redundant
    include = undefined
  }

  const hasIncludes = !!include?.length

  // Make sure action config is not mutated.
  let exclude = !params.exclude ? [] : [...params.exclude]

  // It looks like relative paths with redundant '.' and '..' parts
  // do not work well along with `--exclude` and `--glob-pathspecs` flags.
  // So, we need to normalize paths like './dir' to be just 'dir',
  // otherwise such dirs won't be excluded by `--exclude` flag applied with `--glob-pathspecs`.
  exclude = [...exclude.map(normalize), "**/.garden/**/*"]

  return { include, exclude, hasIncludes }
}

interface Submodule {
  path: string
  url: string
}

const globalArgs = ["--glob-pathspecs"] as const

@Profile()
export class GitSubTreeHandler extends AbstractGitHandler {
  override readonly name = "git"

  constructor(params: VcsHandlerParams) {
    super(params)
  }

  private getLsFilesCommonArgs({ hasIncludes, exclude }: GitSubTreeIncludeExcludeFiles): readonly string[] {
    const lsFilesCommonArgs = ["--cached", "--exclude", this.gardenDirPath]

    if (!hasIncludes) {
      for (const p of exclude) {
        lsFilesCommonArgs.push("--exclude", p)
      }
    }
    return [...lsFilesCommonArgs] as const
  }

  private getLsFilesIgnoredArgs(includeExcludeParams: GitSubTreeIncludeExcludeFiles): readonly string[] {
    const args = [
      ...globalArgs,
      "ls-files",
      "--ignored",
      ...this.getLsFilesCommonArgs(includeExcludeParams),
      "--exclude-per-directory",
      this.ignoreFile,
    ]
    return [...args] as const
  }

  private getLsFilesUntrackedArgs(includeExcludeParams: GitSubTreeIncludeExcludeFiles): readonly string[] {
    const args = [...globalArgs, "ls-files", "-s", "--others", ...this.getLsFilesCommonArgs(includeExcludeParams)]

    if (this.ignoreFile) {
      args.push("--exclude-per-directory", this.ignoreFile)
    }
    args.push(...(includeExcludeParams.include || []))

    return [...args] as const
  }

  private async getModifiedFiles({
    path,
    gitRoot,
    git,
  }: {
    path: string
    gitRoot: string
    git: GitCli
  }): Promise<Set<string>> {
    // List modified files, so that we can ensure we have the right hash for them later
    const modifiedFiles = (await git.getModifiedFiles(path))
      // The output here is relative to the git root, and not the directory `path`
      .map((modifiedRelPath) => resolve(gitRoot, modifiedRelPath))

    return new Set(modifiedFiles)
  }

  private async getTrackedButIgnoredFiles({
    includeExcludeParams,
    git,
  }: {
    includeExcludeParams: GitSubTreeIncludeExcludeFiles
    git: GitCli
  }): Promise<Set<string>> {
    if (!this.ignoreFile) {
      return new Set<string>()
    }

    const trackedButIgnoredFiles = await git.exec(...this.getLsFilesIgnoredArgs(includeExcludeParams))
    return new Set(trackedButIgnoredFiles)
  }

  /**
   * Returns a list of files, along with file hashes, under the given path, taking into account the configured
   * .ignore files, and the specified include/exclude filters.
   */
  override async getFiles(params: GetFilesParams): Promise<VcsFile[]> {
    if (params.include && params.include.length === 0) {
      // No need to proceed, nothing should be included
      return []
    }

    const { log, path, pathDescription = "directory", filter, failOnPrompt = false, hashUntrackedFiles = true } = params

    const gitLog = log.createLog({ name: "git" }).verbose(`Scanning ${pathDescription} at ${path}`)

    gitLog.debug(
      `Include/exclude configuration:\n  → Includes: ${params.include || "(none)"}\n  → Excludes: ${
        params.exclude || "(none)"
      }`
    )

    const isPathDirectory = await isDirectory(path, gitLog)
    if (!isPathDirectory) {
      return []
    }

    const git = new GitCli({ log: gitLog, cwd: path, failOnPrompt })
    const gitRoot = await this.getRepoRoot(gitLog, path, failOnPrompt)

    // List modified files, so that we can ensure we have the right hash for them later
    const modifiedFiles = await this.getModifiedFiles({ path, gitRoot, git })

    const includeExcludeParams = await getIncludeExcludeFiles(params)

    // List tracked but ignored files (we currently exclude those as well, so we need to query that specially)
    const trackedButIgnoredFiles = await this.getTrackedButIgnoredFiles({ includeExcludeParams, git })

    // List all submodule paths in the current path
    const submodules = await this.getSubmodules(path)
    const submodulePaths = submodules.map((s) => join(gitRoot, s.path))
    if (submodules.length > 0) {
      gitLog.silly(() => `Submodules listed at ${submodules.map((s) => `${s.path} (${s.url})`).join(", ")}`)
    }

    let submoduleFiles: Promise<VcsFile[]>[] = []

    // We start processing submodule paths in parallel
    // and don't await the results until this level of processing is completed
    if (submodulePaths.length > 0) {
      const { exclude, include } = includeExcludeParams
      // Need to automatically add `**/*` to directory paths, to match git behavior when filtering.
      const augmentedIncludes = await augmentGlobs(path, include)
      const augmentedExcludes = await augmentGlobs(path, exclude)
      const absExcludes = exclude.map((p) => resolve(path, p))

      // Resolve submodules
      // TODO: see about optimizing this, avoiding scans when we're sure they'll not match includes/excludes etc.
      submoduleFiles = submodulePaths.map(async (submodulePath) => {
        if (!submodulePath.startsWith(path) || absExcludes.includes(submodulePath)) {
          return []
        }

        // Note: We apply include/exclude filters after listing files from submodule
        const submoduleRelPath = relative(path, submodulePath)

        // Catch and show helpful message in case the submodule path isn't a valid directory
        try {
          const pathStats = await lstat(path)

          if (!pathStats.isDirectory()) {
            const pathType = getStatsType(pathStats)
            gitLog.warn(`Expected submodule directory at ${path}, but found ${pathType}. ${submoduleErrorSuggestion}`)
            return []
          }
        } catch (err) {
          if (isErrnoException(err) && err.code === "ENOENT") {
            gitLog.warn(
              `Found reference to submodule at ${submoduleRelPath}, but the path could not be found. ${submoduleErrorSuggestion}`
            )
            return []
          } else {
            throw err
          }
        }

        return this.getFiles({
          log: gitLog,
          path: submodulePath,
          pathDescription: "submodule",
          exclude: [],
          filter: (p) =>
            matchPath(join(submoduleRelPath, p), augmentedIncludes, augmentedExcludes) && (!filter || filter(p)),
          scanRoot: submodulePath,
          failOnPrompt,
          hashUntrackedFiles,
        })
      })
    }

    const untrackedHashedFilesCollector: string[] = []

    // This function is called for each line output from the ls-files commands that we run
    const handleEntry = async (
      entry: GitEntry | undefined,
      { hasIncludes, exclude }: GitSubTreeIncludeExcludeFiles
    ): Promise<VcsFile | undefined> => {
      if (!entry) {
        return undefined
      }

      const { path: filePath, hash } = entry

      // Check filter function, if provided
      if (filter && !filter(filePath)) {
        return
      }
      // Ignore files that are tracked but still specified in ignore files
      if (trackedButIgnoredFiles.has(filePath)) {
        return
      }

      const resolvedPath = resolve(path, filePath)

      // Filter on excludes and submodules
      if (submodulePaths.includes(resolvedPath)) {
        return
      }

      if (hasIncludes) {
        const passesExclusionFilter = matchPath(filePath, undefined, exclude)
        if (!passesExclusionFilter) {
          return
        }
      }

      // We push to the output array if it passes through the exclude filters.
      const output = { path: resolvedPath, hash: hash || "" }

      // No need to stat unless it has no hash, is a symlink, or is modified
      // Note: git ls-files always returns mode 120000 for symlinks
      if (hash && entry.mode !== "120000" && !modifiedFiles.has(resolvedPath)) {
        return ensureHash({
          file: output,
          stats: undefined,
          modifiedFiles,
          hashUntrackedFiles,
          untrackedHashedFilesCollector,
        })
      }

      try {
        const stats = await lstat(resolvedPath)
        // We need to special-case handling of symlinks. We disallow any "unsafe" symlinks, i.e. any ones that may
        // link outside of `gitRoot`.
        if (stats.isSymbolicLink()) {
          const target = await readlink(resolvedPath)

          // Make sure symlink is relative and points within `path`
          if (isAbsolute(target)) {
            gitLog.debug(`Ignoring symlink with absolute target at ${resolvedPath}`)
            return
          } else {
            const realTarget = resolve(dirname(resolvedPath), target)
            const relPath = relative(path, realTarget)

            if (relPath.startsWith("..")) {
              gitLog.debug(`Ignoring symlink pointing outside of ${pathDescription} at ${resolvedPath}`)
              return
            }
            return ensureHash({
              file: output,
              stats,
              modifiedFiles,
              hashUntrackedFiles,
              untrackedHashedFilesCollector,
            })
          }
        } else {
          return ensureHash({
            file: output,
            stats,
            modifiedFiles,
            hashUntrackedFiles,
            untrackedHashedFilesCollector,
          })
        }
      } catch (err) {
        if (isErrnoException(err) && err.code === "ENOENT") {
          return
        }
        throw err
      }
    }

    const queue = new PQueue()
    const scannedFiles: VcsFile[] = []

    // Start git process
    const args = this.getLsFilesUntrackedArgs(includeExcludeParams)
    gitLog.silly(() => `Calling git with args '${args.join(" ")}' in ${path}`)

    const processEnded = defer<void>()
    const proc = execa("git", args, { cwd: path, buffer: false })
    const splitStream = split2()

    // Stream
    const fail = (err: unknown) => {
      proc.kill()
      splitStream.end()
      processEnded.reject(err)
    }

    splitStream.on("data", async (line) => {
      try {
        await queue.add(async () => {
          const gitEntry = parseGitLsFilesOutputLine(line)
          const file = await handleEntry(gitEntry, includeExcludeParams)
          if (file) {
            scannedFiles.push(file)
          }
        })
      } catch (err) {
        fail(err)
      }
    })

    proc.stdout?.pipe(splitStream)

    void proc.on("error", (err: ExecaError) => {
      if (err.exitCode !== 128) {
        fail(err)
      }
    })

    void splitStream.on("end", () => {
      processEnded.resolve()
    })

    // The stream that adds files to be processed has started
    // We wait until the process is completed and then
    // we wait until the queue is empty
    // After that we're done with all possible files to be processed
    await processEnded.promise
    await queue.onIdle()

    if (gardenEnv.GARDEN_GIT_LOG_UNTRACKED_FILES) {
      gitLog.debug(
        dedent`
        Found and hashed ${untrackedHashedFilesCollector.length} files that are not tracked by Git:
        ${untrackedHashedFilesCollector.join("\n")}
        `
      )
    }

    gitLog.verbose(
      `Found ${scannedFiles.length} files in ${pathDescription} ${path} ${renderDuration(gitLog.getDuration())}`
    )

    // We have done the processing of this level of files
    // So now we just have to wait for all the recursive submodules to resolve as well
    // before we can return
    const resolvedSubmoduleFiles = await Promise.all(submoduleFiles)

    return [...scannedFiles, ...resolvedSubmoduleFiles.flat()]
  }

  @pMemoizeDecorator()
  private async getSubmodules(gitModulesConfigDir: string) {
    const submodules: Submodule[] = []
    const gitModulesFilePath = join(gitModulesConfigDir, ".gitmodules")

    if (await pathExists(gitModulesFilePath)) {
      const parsedGitConfig = await parseGitConfig(gitModulesFilePath)

      for (const [key, spec] of Object.entries(parsedGitConfig || {}) as any) {
        if (!key.startsWith("submodule")) {
          continue
        }

        if (isSubmoduleConfig(spec)) {
          submodules.push(spec)
        }
      }
    }

    return submodules
  }
}

function hasStringProperty(obj: object, propertyName: string): boolean {
  return propertyName in obj && typeof obj[propertyName] === "string"
}

function isSubmoduleConfig(obj: object): obj is Submodule {
  return hasStringProperty(obj, "path") && hasStringProperty(obj, "url")
}

async function parseGitConfig(filePath: string): Promise<object> {
  const buffer = await readFile(filePath, { encoding: "utf-8" })
  return parseIni(buffer)
}

async function isDirectory(path: string, gitLog: Log): Promise<boolean> {
  try {
    const pathStats = await lstat(path)

    if (!pathStats.isDirectory()) {
      gitLog.warn(`Expected directory at ${path}, but found ${getStatsType(pathStats)}.`)
      return false
    }
  } catch (err) {
    if (isErrnoException(err) && err.code === "ENOENT") {
      gitLog.warn(`Attempted to scan directory at ${path}, but it does not exist.`)
      return false
    } else {
      throw err
    }
  }
  return true
}

function parseGitLsFilesOutputLine(data: Buffer): GitEntry | undefined {
  const line = data.toString().trim()
  if (!line) {
    return undefined
  }

  let filePath: string
  let mode = ""
  let hash = ""

  const split = line.trim().split("\t")

  if (split.length === 1) {
    // File is untracked
    filePath = split[0]
  } else {
    filePath = split[1]
    const info = split[0].split(" ")
    mode = info[0]
    hash = info[1]
  }

  return { path: filePath, hash, mode }
}

/**
 * Make sure we have a fresh hash for each file.
 */
async function ensureHash({
  file,
  stats,
  modifiedFiles,
  hashUntrackedFiles,
  untrackedHashedFilesCollector,
}: {
  file: VcsFile
  stats: fsExtra.Stats | undefined
  modifiedFiles: Set<string>
  hashUntrackedFiles: boolean
  untrackedHashedFilesCollector: string[]
}): Promise<VcsFile> {
  // If the file has not been modified, then it's either committed or untracked.
  if (!modifiedFiles.has(file.path)) {
    // If the hash is already defined, then the file is committed and its hash is up-to-date.
    if (file.hash !== "") {
      return file
    }

    // Otherwise, the file is untracked.
    if (!hashUntrackedFiles) {
      // So we can skip its hash calculation if we don't need the hashes of untracked files.
      // Hashes can be skipped while scanning the FS for Garden config files.
      return file
    }
  }

  // Don't attempt to hash directories. Directories (which will only come up via symlinks btw)
  // will by extension be filtered out of the list.
  if (!stats || stats.isDirectory()) {
    return file
  }

  const hash = await hashObject(stats, file.path)
  if (hash !== "") {
    file.hash = hash
  }
  if (gardenEnv.GARDEN_GIT_LOG_UNTRACKED_FILES) {
    untrackedHashedFilesCollector.push(file.path)
  }

  return file
}
