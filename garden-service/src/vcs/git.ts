/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as execa from "execa"
import { join, resolve } from "path"
import { flatten } from "lodash"
import { ensureDir, pathExists, stat, createReadStream } from "fs-extra"
import { PassThrough } from "stream"
import * as hasha from "hasha"

import { VcsHandler, RemoteSourceParams, VcsFile, GetFilesParams } from "./vcs"
import { ConfigurationError, RuntimeError } from "../exceptions"
import * as Bluebird from "bluebird"
import { matchPath } from "../util/fs"
import { deline } from "../util/string"
import { splitLast } from "../util/util"
import { LogEntry } from "../logger/log-entry"

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
      { repositoryUrl: url },
    )
  }
  const parsed = { repositoryUrl: parts[0], hash: parts[1] }
  return parsed
}

interface GitCli {
  (...args: string[]): Promise<string[]>
}

// TODO Consider moving git commands to separate (and testable) functions
export class GitHandler extends VcsHandler {
  name = "git"

  private gitCli(log: LogEntry, cwd: string): GitCli {
    return async (...args: string[]) => {
      log.silly(`Calling git with args '${args.join(" ")}`)
      const output = await execa.stdout("git", args, { cwd })
      return output.split("\n").filter(line => line.length > 0)
    }
  }

  private async getModifiedFiles(git: GitCli, path: string) {
    try {
      return await git("diff-index", "--name-only", "HEAD", path)
    } catch (err) {
      if (err.code === 128) {
        // no commit in repo
        return []
      } else {
        throw err
      }
    }
  }

  async getFiles({ log, path, include, exclude }: GetFilesParams): Promise<VcsFile[]> {
    const git = this.gitCli(log, path)

    let lines: string[] = []
    let ignored: string[] = []

    /**
     * TODO: Replace the relative path handling in this function with a generic convertible path object
     * once that's been implemented.
     */
    const gitRoot = (await git("rev-parse", "--show-toplevel"))[0]

    try {
      /**
       * We need to exclude .garden to avoid errors when path is the project root. This happens e.g. for modules
       * whose config is colocated with the project config, and that don't specify include paths/patterns.
       */
      // FIXME: We should use `garden.gardenDirPath` instead of ".garden" since the gardenDirPath
      // property is configurable.
      lines = await git("ls-files", "-s", "--others", "--exclude=.garden", path)

      // List ignored files from .gardenignore. We need to run ls-files twice to get both tracked and untracked files.
      const lsIgnoredFiles = ["ls-files", "--ignored", ...this.ignoreFiles.map(f => `--exclude-per-directory=${f}`)]
      const lsUntrackedIgnoredFiles = [...lsIgnoredFiles, "--others"]

      ignored = flatten(await Bluebird.map([lsIgnoredFiles, lsUntrackedIgnoredFiles], async (cmd) => git(...cmd, path)))
    } catch (err) {
      // if we get 128 we're not in a repo root, so we get no files
      if (err.code !== 128) {
        throw err
      }
    }

    const files = await Bluebird.map(lines, async (line) => {
      const split = line.trim().split("\t")
      if (split.length === 1) {
        // File is untracked
        return { path: split[0] }
      } else {
        return { path: split[1], hash: split[0].split(" ")[1] }
      }
    })

    const modifiedArr = ((await this.getModifiedFiles(git, path)) || [])
      .map(modifiedRelPath => resolve(gitRoot, modifiedRelPath))
    const modified = new Set(modifiedArr)

    const filtered = files
      .filter(f => matchPath(f.path, include, exclude))
      .filter(f => !ignored.includes(f.path))

    return Bluebird.map(filtered, async (f) => {
      const resolvedPath = resolve(path, f.path)
      if (!f.hash || modified.has(resolvedPath)) {
        // If we can't compute the hash, i.e. the file is gone, we filter it out below
        let hash = ""
        try {
          // "git ls-files" returns a symlink even if it points to a directory.
          // We filter symlinked directories out, since hashObject() will fail to
          // process them.
          if (!(await stat(resolvedPath)).isDirectory()) {
            hash = await this.hashObject(resolvedPath) || ""
          }
        } catch (err) {
          // 128 = File no longer exists
          if (err.code !== 128 && err.code !== "ENOENT") {
            throw err
          }
        }
        return { path: resolvedPath, hash }
      } else {
        return { path: resolvedPath, hash: f.hash }
      }
    }).filter(f => f.hash !== "")
  }

  private async cloneRemoteSource(
    log: LogEntry, remoteSourcesPath: string, repositoryUrl: string, hash: string, absPath: string,
  ) {
    const git = this.gitCli(log, remoteSourcesPath)
    return git("clone", "--depth=1", `--branch=${hash}`, repositoryUrl, absPath)
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
   */
  async hashObject(path: string) {
    const info = await stat(path)
    const stream = new PassThrough()
    const output = hasha.fromStream(stream, { algorithm: "sha1" })
    stream.push(`blob ${info.size}\0`)
    createReadStream(path).pipe(stream)
    return output
  }
}
