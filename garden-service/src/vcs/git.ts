/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import execa = require("execa")
import { join, resolve } from "path"
import { ensureDir, pathExists } from "fs-extra"

import { VcsHandler, RemoteSourceParams } from "./vcs"
import { ConfigurationError, RuntimeError } from "../exceptions"
import * as Bluebird from "bluebird"
import { matchGlobs } from "../util/fs"

export function getCommitIdFromRefList(refList: string[]): string {
  try {
    return refList[0].split("\t")[0]
  } catch (err) {
    return refList[0]
  }
}

export function parseGitUrl(url: string) {
  const parts = url.split("#")
  const parsed = { repositoryUrl: parts[0], hash: parts[1] }
  if (!parsed.hash) {
    throw new ConfigurationError(
      "Repository URLs must contain a hash part pointing to a specific branch or tag" +
      " (e.g. https://github.com/org/repo.git#master)",
      { repositoryUrl: url },
    )
  }
  return parsed
}

interface GitCli {
  (...args: string[]): Promise<string[]>
}

// TODO Consider moving git commands to separate (and testable) functions
export class GitHandler extends VcsHandler {
  name = "git"

  private gitCli(cwd: string): GitCli {
    return async (...args: string[]) => {
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

  async getFiles(path: string, include?: string[]) {
    const git = this.gitCli(path)

    let lines: string[] = []
    let ignored: string[] = []

    try {
      lines = await git("ls-files", "-s", "--other", "--exclude=.garden", path)
      ignored = await git("ls-files", "--ignored", "--exclude-per-directory=.gardenignore", path)
    } catch (err) {
      // if we get 128 we're not in a repo root, so we get no files
      if (err.code !== 128) {
        throw err
      }
    }

    const files = await Bluebird.map(lines, async (line) => {
      const split = line.trim().split(" ")
      if (split.length === 1) {
        // File is untracked
        return { path: split[0] }
      } else {
        return { path: split[2].split("\t")[1], hash: split[1] }
      }
    })

    const modified = new Set(await this.getModifiedFiles(git, path))
    const filtered = files
      .filter(f => !include || matchGlobs(f.path, include))
      .filter(f => !ignored.includes(f.path))

    return Bluebird.map(filtered, async (f) => {
      const resolvedPath = resolve(path, f.path)

      if (!f.hash || modified.has(f.path)) {
        // If we can't compute the hash, i.e. the file is gone, we filter it out below
        let hash = ""
        try {
          hash = (await git("hash-object", resolvedPath))[0]
        } catch (err) {
          // 128 = File no longer exists
          if (err.code !== 128) {
            throw err
          }
        }
        return { path: resolvedPath, hash }
      } else {
        return { path: resolvedPath, hash: f.hash }
      }
    }).filter(f => f.hash !== "")
  }

  // TODO Better auth handling
  async ensureRemoteSource({ url, name, log, sourceType }: RemoteSourceParams): Promise<string> {
    const remoteSourcesPath = join(this.projectRoot, this.getRemoteSourcesDirname(sourceType))
    await ensureDir(remoteSourcesPath)
    const git = this.gitCli(remoteSourcesPath)

    const absPath = join(this.projectRoot, this.getRemoteSourcePath(name, url, sourceType))
    const isCloned = await pathExists(absPath)

    if (!isCloned) {
      const entry = log.info({ section: name, msg: `Fetching from ${url}`, status: "active" })
      const { repositoryUrl, hash } = parseGitUrl(url)

      try {
        await git("clone", "--depth=1", `--branch=${hash}`, repositoryUrl, absPath)
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
    const absPath = join(this.projectRoot, this.getRemoteSourcePath(name, url, sourceType))
    const git = this.gitCli(absPath)
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

}
