/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join, posix } from "path"
import fsExtra, { remove } from "fs-extra"
import { PassThrough } from "stream"
import type { RemoteSourceParams, VcsHandlerParams, VcsInfo } from "./vcs.js"
import { VcsHandler } from "./vcs.js"
import type { GardenError } from "../exceptions.js"
import { ChildProcessError, ConfigurationError, RuntimeError } from "../exceptions.js"
import { joinWithPosix } from "../util/fs.js"
import { dedent, deline, splitLast } from "../util/string.js"
import { defer, exec } from "../util/util.js"
import type { Log } from "../logger/log-entry.js"
import { Profile } from "../util/profiling.js"
import isGlob from "is-glob"
import AsyncLock from "async-lock"
import { isSha1 } from "../util/hashing.js"
import { hashingStream } from "hasha"

const { createReadStream, ensureDir, pathExists, readlink, lstat } = fsExtra

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
    throw new ConfigurationError({
      message: deline`
        Repository URLs must contain a hash part pointing to a specific branch or tag
        (e.g. https://github.com/org/repo.git#main). Actually got: '${url}'`,
    })
  }
  return { repositoryUrl: parts[0], hash: parts[1] }
}

interface GitCliExecutor {
  /**
   * @throws ChildProcessError
   */
  (...args: string[]): Promise<string[]>
}

type GitCliParams = { log: Log; cwd: string; failOnPrompt?: boolean }

function gitCliExecutor({ log, cwd, failOnPrompt = false }: GitCliParams): GitCliExecutor {
  /**
   * @throws ChildProcessError
   */
  return async (...args: string[]) => {
    log.silly(() => `Calling git with args '${args.join(" ")}' in ${cwd}`)
    const { stdout } = await exec("git", args, {
      cwd,
      maxBuffer: 100 * 1024 * 1024,
      environment: failOnPrompt ? { GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "true" } : undefined,
    })
    return stdout.split("\n").filter((line) => line.length > 0)
  }
}

export class GitCli {
  private readonly git: GitCliExecutor
  private readonly log: Log

  constructor(params: GitCliParams) {
    this.git = gitCliExecutor(params)
    this.log = params.log
  }

  public async exec(...args: string[]) {
    return await this.git(...args)
  }

  public async getModifiedFiles(path: string): Promise<string[]> {
    try {
      return await this.git("diff-index", "--name-only", "HEAD", path)
    } catch (err) {
      if (err instanceof ChildProcessError && err.details.code === 128) {
        // no commit in repo
        return []
      } else {
        throw err
      }
    }
  }

  public async getLastCommitHash(): Promise<string> {
    const result = await this.git("rev-parse", "HEAD")
    return result[0]
  }

  public async getRepositoryRoot(): Promise<string> {
    const result = await this.git("rev-parse", "--show-toplevel")
    return result[0]
  }

  public async getBranchName(): Promise<string> {
    const result = await this.git("rev-parse", "--abbrev-ref", "HEAD")
    return result[0]
  }

  public async getOriginUrl(): Promise<string> {
    const result = await this.git("config", "--get", "remote.origin.url")
    return result[0]
  }

  public async getPathInfo() {
    const output: VcsInfo = {
      repositoryRootDirAbs: "",
      branch: "",
      commitHash: "",
      originUrl: "",
    }

    try {
      output.branch = await this.getBranchName()
      output.commitHash = await this.getLastCommitHash()
    } catch (err) {
      if (err instanceof ChildProcessError && err.details.code !== 128) {
        throw err
      }
    }

    try {
      output.originUrl = await this.getOriginUrl()
    } catch (err) {
      // Just ignore if not available
      this.log.silly(() => `Tried to retrieve git remote.origin.url but encountered an error: ${err}`)
    }

    try {
      output.repositoryRootDirAbs = await this.getRepositoryRoot()
    } catch (err) {
      // Just ignore if not available
      this.log.silly(() => `Tried to retrieve git repository root but encountered an error: ${err}`)
    }

    return output
  }
}

@Profile()
export abstract class AbstractGitHandler extends VcsHandler {
  private readonly repoRoots: Map<string, string>
  protected readonly lock: AsyncLock

  protected constructor(params: VcsHandlerParams) {
    super(params)
    this.repoRoots = new Map<string, string>()
    this.lock = new AsyncLock()
  }

  async getRepoRoot(log: Log, path: string, failOnPrompt = false): Promise<string> {
    let cachedRepoRoot = this.repoRoots.get(path)
    if (!!cachedRepoRoot) {
      this.profiler.inc("GitHandler.RepoRoots.hits")
      return cachedRepoRoot
    }

    // Make sure we're not asking concurrently for the same root
    return this.lock.acquire(`repo-root:${path}`, async () => {
      cachedRepoRoot = this.repoRoots.get(path)
      if (!!cachedRepoRoot) {
        this.profiler.inc("GitHandler.RepoRoots.hits")
        return cachedRepoRoot
      }

      try {
        const git = new GitCli({ log, cwd: path, failOnPrompt })
        const repoRoot = await git.getRepositoryRoot()
        this.repoRoots.set(path, repoRoot)
        this.profiler.inc("GitHandler.RepoRoots.misses")
        return repoRoot
      } catch (err) {
        if (!(err instanceof ChildProcessError)) {
          throw err
        }
        throw explainGitError(err, path)
      }
    })
  }

  private async cloneRemoteSource(
    log: Log,
    repositoryUrl: string,
    hash: string,
    absPath: string,
    failOnPrompt = false
  ) {
    await ensureDir(absPath)
    const git = new GitCli({ log, cwd: absPath, failOnPrompt })
    // Use `--recursive` to include submodules
    if (!isSha1(hash)) {
      return git.exec(
        "-c",
        "protocol.file.allow=always",
        "clone",
        "--recursive",
        "--depth=1",
        "--shallow-submodules",
        `--branch=${hash}`,
        repositoryUrl,
        "."
      )
    }

    // If SHA1 is used we need to fetch the changes as git clone doesn't allow to shallow clone
    // a specific hash
    try {
      await git.exec("init")
      await git.exec("remote", "add", "origin", repositoryUrl)
      await git.exec(
        "-c",
        "protocol.file.allow=always",
        "fetch",
        "--depth=1",
        "--recurse-submodules=yes",
        "origin",
        hash
      )
      await git.exec("checkout", "FETCH_HEAD")
      return git.exec("-c", "protocol.file.allow=always", "submodule", "update", "--init", "--recursive")
    } catch (err) {
      throw new RuntimeError({
        message: dedent`
          Failed to shallow clone with error: ${err}

          Make sure both git client and server are newer than 2.5.0 and that \`uploadpack.allowReachableSHA1InWant=true\` is set on the server`,
      })
    }
  }

  // TODO Better auth handling
  async ensureRemoteSource({ url, name, log, sourceType, failOnPrompt = false }: RemoteSourceParams): Promise<string> {
    return this.withRemoteSourceLock(sourceType, name, async () => {
      const remoteSourcesPath = this.getRemoteSourcesLocalPath(sourceType)
      await ensureDir(remoteSourcesPath)

      const absPath = this.getRemoteSourceLocalPath(name, url, sourceType)
      const isCloned = await pathExists(join(absPath, ".git"))

      if (!isCloned) {
        const gitLog = log.createLog({ name, showDuration: true }).info(`Fetching from ${url}`)
        const { repositoryUrl, hash } = parseGitUrl(url)

        try {
          // Ensure dir is clean before cloning
          await remove(absPath)
          await ensureDir(absPath)
          await this.cloneRemoteSource(log, repositoryUrl, hash, absPath, failOnPrompt)
        } catch (err) {
          gitLog.error(`Failed fetching from ${url}`)
          // Cleanup the remote source dir if cloning fails
          await remove(absPath)
          throw new RuntimeError({
            message: `Downloading remote ${sourceType} (from ${url}) failed with error: \n\n${err}`,
          })
        }

        gitLog.success("Done")
      }

      return absPath
    })
  }

  async updateRemoteSource({ url, name, sourceType, log, failOnPrompt = false }: RemoteSourceParams) {
    const absPath = this.getRemoteSourceLocalPath(name, url, sourceType)
    const git = new GitCli({ log, cwd: absPath, failOnPrompt })
    const { repositoryUrl, hash } = parseGitUrl(url)

    await this.ensureRemoteSource({ url, name, sourceType, log, failOnPrompt })

    await this.withRemoteSourceLock(sourceType, name, async () => {
      const gitLog = log.createLog({ name, showDuration: true }).info("Getting remote state")
      await git.exec("remote", "update")

      const localCommitId = await git.getLastCommitHash()
      const remoteCommitId = isSha1(hash)
        ? hash
        : getCommitIdFromRefList(await git.exec("ls-remote", repositoryUrl, hash))

      if (localCommitId !== remoteCommitId) {
        gitLog.info(`Fetching from ${url}`)

        try {
          await git.exec("fetch", "--depth=1", "origin", hash)
          await git.exec("reset", "--hard", `origin/${hash}`)
          // Update submodules if applicable (no-op if no submodules in repo)
          await git.exec("-c", "protocol.file.allow=always", "submodule", "update", "--recursive")
        } catch (err) {
          gitLog.error(`Failed fetching from ${url}`)
          throw new RuntimeError({
            message: `Updating remote ${sourceType} (at url: ${url}) failed with error: \n\n${err}`,
          })
        }

        gitLog.success("Source updated")
      } else {
        gitLog.success("Source already up to date")
      }
    })
  }

  private withRemoteSourceLock(sourceType: string, name: string, func: () => Promise<any>) {
    return this.lock.acquire(`remote-source-${sourceType}-${name}`, func)
  }

  async getPathInfo(log: Log, path: string, failOnPrompt = false): Promise<VcsInfo> {
    return await getPathInfo(log, path, failOnPrompt)
  }
}

/**
 * Replicates the `git hash-object` behavior. See https://stackoverflow.com/a/5290484/3290965
 * We deviate from git's behavior when dealing with symlinks, by hashing the target of the symlink and not the
 * symlink itself. If the symlink cannot be read, we hash the link contents like git normally does.
 */
export async function hashObject(stats: fsExtra.Stats, path: string): Promise<string> {
  const hash = hashingStream({ algorithm: "sha1" })

  if (stats.isSymbolicLink()) {
    // For symlinks, we follow git's behavior, which is to hash the link itself (i.e. the path it contains) as
    // opposed to the file/directory that it points to.
    try {
      const linkPath = await readlink(path)
      hash.update(`blob ${stats.size}\0${linkPath}`)
      hash.end()
      const output = hash.read()
      return output
    } catch (err) {
      // Ignore errors here, just output empty hash
      return ""
    }
  } else {
    const stream = new PassThrough()
    stream.push(`blob ${stats.size}\0`)

    const result = defer<string>()
    stream
      .on("error", () => {
        // Ignore file read error
        result.resolve("")
      })
      .pipe(hash)
      .on("error", (err) => result.reject(err))
      .on("finish", () => {
        const output = hash.read()
        result.resolve(output)
      })

    createReadStream(path).pipe(stream)

    return result.promise
  }
}

function gitErrorContains(err: ChildProcessError, substring: string): boolean {
  return err.details.stderr.toLowerCase().includes(substring.toLowerCase())
}

export function explainGitError(err: ChildProcessError, path: string): GardenError {
  // handle some errors with exit codes 128 in a specific manner
  if (err.details.code === 128) {
    if (gitErrorContains(err, "fatal: not a git repository")) {
      // Throw nice error when we detect that we're not in a repo root
      return new RuntimeError({
        message: deline`
    Path ${path} is not in a git repository root. Garden must be run from within a git repo.
    Please run \`git init\` if you're starting a new project and repository, or move the project to an
    existing repository, and try again.
  `,
      })
    }
  }

  // otherwise just re-throw the original error
  return err
}

/**
 * Given a list of POSIX-style globs/paths and a `basePath`, find paths that point to a directory and append `**\/*`
 * to them, such that they'll be matched consistently between git and our internal pattern matching.
 */
export async function augmentGlobs(basePath: string, globs: string[]): Promise<string[]>
export async function augmentGlobs(basePath: string, globs?: string[]): Promise<string[] | undefined>
export async function augmentGlobs(basePath: string, globs?: string[]): Promise<string[] | undefined> {
  if (!globs || globs.length === 0) {
    return globs
  }

  return Promise.all(
    globs.map(async (pattern) => {
      if (isGlob(pattern, { strict: false })) {
        // Pass globs through directly (they won't match a specific directory)
        return pattern
      }

      try {
        const path = joinWithPosix(basePath, pattern)
        const stats = await lstat(path)
        return stats.isDirectory() ? posix.join(pattern, "**", "*") : pattern
      } catch {
        return pattern
      }
    })
  )
}

export async function getPathInfo(log: Log, path: string, failOnPrompt = false): Promise<VcsInfo> {
  const git = new GitCli({ log, cwd: path, failOnPrompt })
  return await git.getPathInfo()
}
