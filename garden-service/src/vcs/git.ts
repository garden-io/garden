/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import execa = require("execa")
import { join } from "path"
import { ensureDir, pathExists, stat } from "fs-extra"
import Bluebird = require("bluebird")

import { NEW_MODULE_VERSION, VcsHandler, RemoteSourceParams } from "./base"

export const helpers = {
  gitCli: (cwd: string): (cmd: string, args: string[]) => Promise<string> => {
    return async (cmd, args) => {
      return execa.stdout("git", [cmd, ...args], { cwd })
    }
  },
}

function getGitUrlParts(url: string) {
  const parts = url.split("#")
  return { repositoryUrl: parts[0], hash: parts[1] }
}

function parseRefList(res: string): string {
  const refList = res.split("\n").map(str => {
    const parts = str.split("\n")
    return { commitId: parts[0], ref: parts[1] }
  })
  return refList[0].commitId
}

// TODO Consider moving git commands to separate (and testable) functions
export class GitHandler extends VcsHandler {
  name = "git"

  async getTreeVersion(path: string) {
    const git = helpers.gitCli(path)

    let commitHash
    try {
      commitHash = await git("rev-list", [
        "--max-count=1",
        "--abbrev-commit",
        "--abbrev=10",
        "HEAD",
      ]) || NEW_MODULE_VERSION
    } catch (err) {
      if (err.code === 128) {
        // not in a repo root, return default version
        commitHash = NEW_MODULE_VERSION
      }
    }

    let latestDirty = 0

    const res = await git("diff-index", ["--name-only", "HEAD", path]) + "\n"
      + await git("ls-files", ["--other", "--exclude-standard", path])

    const dirtyFiles: string[] = res.split("\n").filter((f) => f.length > 0)
    // for dirty trees, we append the last modified time of last modified or added file
    if (dirtyFiles.length) {
      const repoRoot = await git("rev-parse", ["--show-toplevel"])
      const stats = await Bluebird.map(dirtyFiles, file => join(repoRoot, file))
        .filter((file: string) => pathExists(file))
        .map((file: string) => stat(file))

      let mtimes = stats.map((s) => Math.round(s.mtime.getTime() / 1000))
      let latest = mtimes.sort().slice(-1)[0]

      if (latest > latestDirty) {
        latestDirty = latest
      }
    }

    return {
      latestCommit: commitHash,
      dirtyTimestamp: latestDirty || null,
    }
  }

  // TODO Better auth handling
  async ensureRemoteSource({ url, name, logEntry, sourceType }: RemoteSourceParams): Promise<string> {
    const remoteSourcesPath = join(this.projectRoot, this.getRemoteSourcesDirname(sourceType))
    await ensureDir(remoteSourcesPath)
    const git = helpers.gitCli(remoteSourcesPath)

    const absPath = join(this.projectRoot, this.getRemoteSourcePath(name, url, sourceType))
    const isCloned = await pathExists(absPath)

    if (!isCloned) {
      const entry = logEntry.info({ section: name, msg: `Fetching from ${url}`, status: "active" })
      const { repositoryUrl, hash } = getGitUrlParts(url)

      const cmdOpts = ["--depth=1"]
      if (hash) {
        cmdOpts.push("--branch=hash")
      }

      await git("clone", [...cmdOpts, repositoryUrl, absPath])

      entry.setSuccess()
    }

    return absPath
  }

  async updateRemoteSource({ url, name, sourceType, logEntry }: RemoteSourceParams) {
    const absPath = join(this.projectRoot, this.getRemoteSourcePath(name, url, sourceType))
    const git = helpers.gitCli(absPath)
    const { repositoryUrl, hash } = getGitUrlParts(url)

    await this.ensureRemoteSource({ url, name, sourceType, logEntry })

    const entry = logEntry.info({ section: name, msg: "Getting remote state", status: "active" })
    await git("remote", ["update"])

    const listRemoteArgs = hash ? [repositoryUrl, hash] : [repositoryUrl]
    const showRefArgs = hash ? [hash] : []
    const remoteCommitId = parseRefList(await git("ls-remote", listRemoteArgs))
    const localCommitId = parseRefList(await git("show-ref", ["--hash", ...showRefArgs]))

    if (localCommitId !== remoteCommitId) {
      entry.setState(`Fetching from ${url}`)

      const fetchArgs = hash ? ["origin", hash] : ["origin"]
      const resetArgs = hash ? [`origin/${hash}`] : ["origin"]
      await git("fetch", ["--depth=1", ...fetchArgs])
      await git("reset", ["--hard", ...resetArgs])

      entry.setSuccess("Source updated")
    } else {
      entry.setSuccess("Source already up to date")
    }
  }

}
