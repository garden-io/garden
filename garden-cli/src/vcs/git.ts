/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { exec } from "child-process-promise"
import { join } from "path"
import { ensureDir, pathExists, stat } from "fs-extra"
import { argv } from "process"
import Bluebird = require("bluebird")
import { parse } from "url"

import { NEW_MODULE_VERSION, VcsHandler, RemoteSourceParams } from "./base"
import { EntryStyle } from "../logger/types"

export const helpers = {
  gitCli: (cwd: string): (args: string | string[]) => Promise<string> => {
    return async args => {
      const cmd = Array.isArray(args) ? `git ${args.join(" && git ")}` : `git ${args}`
      const res = await exec(cmd, { cwd })
      return res.stdout.trim()
    }
  },
}

function getUrlHash(url: string) {
  return (parse(url).hash || "").split("#")[1]
}

export class GitHandler extends VcsHandler {
  name = "git"

  async getTreeVersion(path: string) {
    const git = helpers.gitCli(path)

    let commitHash
    try {
      commitHash = await git("rev-list -1 --abbrev-commit --abbrev=10 HEAD") || NEW_MODULE_VERSION
    } catch (err) {
      if (err.code === 128) {
        // not in a repo root, return default version
        commitHash = NEW_MODULE_VERSION
      }
    }

    let latestDirty = 0

    const res = await git([`diff-index --name-only HEAD ${path}`, `ls-files --other --exclude-standard ${path}`])

    const dirtyFiles: string[] = res.split("\n").filter((f) => f.length > 0)
    // for dirty trees, we append the last modified time of last modified or added file
    if (dirtyFiles.length) {

      const repoRoot = await git("rev-parse --show-toplevel")
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
    const remoteSourcesPath = join(this.projectRoot, this.getRemoteSourcesDirName(sourceType))
    await ensureDir(remoteSourcesPath)
    const git = helpers.gitCli(remoteSourcesPath)
    const fullPath = join(remoteSourcesPath, name)

    if (!(await pathExists(fullPath))) {
      const entry = logEntry.info({ section: name, msg: `Fetching from ${url}`, entryStyle: EntryStyle.activity })
      const hash = getUrlHash(url)
      const branch = hash ? `--branch=${hash}` : ""

      await git(`clone --depth=1 ${branch} ${url} ${name}`)

      entry.setSuccess()
    }

    return fullPath
  }

  async updateRemoteSource({ url, name, sourceType, logEntry }: RemoteSourceParams) {
    const sourcePath = join(this.projectRoot, this.getRemoteSourcesDirName(sourceType), name)
    const git = helpers.gitCli(sourcePath)
    await this.ensureRemoteSource({ url, name, sourceType, logEntry })

    const entry = logEntry.info({ section: name, msg: "Getting remote state", entryStyle: EntryStyle.activity })
    await git("remote update")

    const remoteHash = await git("rev-parse @")
    const localHash = await git("rev-parse @{u}")
    if (localHash !== remoteHash) {
      entry.setState({ section: name, msg: `Fetching from ${url}`, entryStyle: EntryStyle.activity })
      const hash = getUrlHash(url)

      await git([`fetch origin ${hash} --depth=1`, `reset origin/${hash} --hard`])

      entry.setSuccess("Source updated")
    } else {
      entry.setSuccess("Source up to date")
    }
  }

}

// used by the build process to resolve and store the tree version for plugin modules
if (require.main === module) {
  const path = argv[2]
  const handler = new GitHandler(path)

  handler.getTreeVersion(path)
    .then((treeVersion) => {
      console.log(JSON.stringify(treeVersion, null, 4))
    })
}
