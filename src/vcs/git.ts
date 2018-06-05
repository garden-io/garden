/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { exec } from "child-process-promise"
import { NEW_MODULE_VERSION, TreeVersion, VcsHandler } from "./base"
import { join } from "path"
import { sortBy } from "lodash"
import { pathExists, stat } from "fs-extra"
import Bluebird = require("bluebird")

export class GitHandler extends VcsHandler {
  async getTreeVersion(directories: string[]) {
    let res
    let commitHash

    try {
      res = await this.git(`rev-list -1 --abbrev-commit --abbrev=10 HEAD ${directories.join(" ")}`)
      commitHash = res.stdout.trim() || NEW_MODULE_VERSION
    } catch (err) {
      if (err.code === 128) {
        // not in a repo root, return default version
        commitHash = NEW_MODULE_VERSION
      }
    }

    let latestDirty = 0

    for (let directory of directories) {
      res = await this.git(
        `diff-index --name-only HEAD ${directory} && git ls-files --other --exclude-standard ${directory}`,
      )

      const dirtyFiles: string[] = res.stdout.trim().split("\n").filter((f) => f.length > 0)
      const repoRoot = await this.getRepoRoot()

      // for dirty trees, we append the last modified time of last modified or added file
      if (dirtyFiles.length) {

        const safelyCallStat = (f: string) => stat(f)

        const stats = await Bluebird.map(dirtyFiles, file => join(repoRoot, file))
          .filter(pathExists)
          // NOTE: We need to explicitly use an arrow function when calling stat in the context of a Bluebird.map!
          // Looks like a bug in fs or fs-extra.
          // Works: map((f: string) => stat(f))
          // Fails silenty: map(stat)
          .map(safelyCallStat)

        let mtimes = stats.map((s) => Math.round(s.mtime.getTime() / 1000))
        let latest = mtimes.sort().slice(-1)[0]

        if (latest > latestDirty) {
          latestDirty = latest
        }
      }
    }

    return {
      versionString: latestDirty ? `${commitHash}-${latestDirty}` : commitHash,
      latestCommit: commitHash,
      dirtyTimestamp: latestDirty || null,
    }
  }

  async sortVersions(versions: TreeVersion[]) {
    let getPosition = async (version) => {
      let { latestCommit, dirtyTimestamp } = version

      if (dirtyTimestamp) {
        // any dirty versions will be sorted by latest timestamp
        return -parseInt(dirtyTimestamp, 10)
      } else if (latestCommit === NEW_MODULE_VERSION) {
        return 0
      } else {
        // clean versions are sorted by their commit distance from HEAD
        return await this.getOffsetFromHead(latestCommit)
      }
    }
    let positions = {}

    await Bluebird.each(versions, async v => {
      positions[v.versionString] = await getPosition(v)
    })

    // TODO: surely there's a better way around this lodash quirk
    return <TreeVersion[]><any>sortBy(versions, v => positions[v.versionString])
  }

  // private async getCurrentBranch() {
  //   return (await this.git("rev-parse --abbrev-ref HEAD")).stdout.trim()
  // }

  private async getOffsetFromHead(commitHash: string) {
    let res = await this.git(`rev-list --left-right --count ${commitHash}...HEAD`)
    return parseInt(res.stdout.trim().split("\t")[1], 10)
  }

  private async getRepoRoot() {
    const res = await this.git(`rev-parse --show-toplevel`)
    return res.stdout.trim()
  }

  private async git(args) {
    return exec("git " + args, { cwd: this.projectRoot })
  }
}
