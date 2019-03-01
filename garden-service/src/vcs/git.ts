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

import { NEW_MODULE_VERSION, VcsHandler, RemoteSourceParams } from "./base"
import { ConfigurationError, RuntimeError } from "../exceptions"

export function getCommitIdFromRefList(refList: string): string {
  try {
    return refList.split("\n")[0].split("\t")[0]
  } catch (err) {
    return refList
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

// TODO Consider moving git commands to separate (and testable) functions
export class GitHandler extends VcsHandler {
  name = "git"

  private gitCli(cwd: string) {
    return async (...args: string[]) => {
      return execa.stdout("git", args, { cwd })
    }
  }

  async getLatestCommit(path: string) {
    const git = this.gitCli(path)

    try {
      return await git(
        "rev-list",
        "--max-count=1",
        "--abbrev-commit",
        "--abbrev=10",
        "HEAD",
      ) || NEW_MODULE_VERSION
    } catch (err) {
      if (err.code === 128) {
        // not in a repo root, use default version
        return NEW_MODULE_VERSION
      } else {
        throw err
      }
    }
  }

  async getDirtyFiles(path: string) {
    const git = this.gitCli(path)
    let modifiedFiles: string[]

    const repoRoot = await git("rev-parse", "--show-toplevel")

    try {
      modifiedFiles = (await git("diff-index", "--name-only", "HEAD", path))
        .split("\n")
        .filter((f) => f.length > 0)
        .map(file => resolve(repoRoot, file))
    } catch (err) {
      if (err.code === 128) {
        // no commit in repo
        modifiedFiles = []
      } else {
        throw err
      }
    }

    const newFiles = (await git("ls-files", "--other", "--exclude-standard", path))
      .split("\n")
      .filter((f) => f.length > 0)
      .map(file => resolve(path, file))

    return modifiedFiles.concat(newFiles)
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
