import { exec } from "child-process-promise"
import { NEW_MODULE_VERSION, VcsHandler } from "./base"
import { join } from "path"
import { sortBy } from "lodash"
import { existsSync, statSync } from "fs"
import Bluebird = require("bluebird")

export class GitHandler extends VcsHandler {
  async getTreeVersion(directories) {
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

      let dirtyFiles = res.stdout.trim().split("\n").filter((f) => f.length > 0)

      if (dirtyFiles.length) {
        // for dirty trees, we append the last modified time of last modified or added file
        let stats = dirtyFiles
          .map((file) => {
            let filePath = join(this.context.projectRoot, file)
            return existsSync(filePath) ? statSync(filePath) : null
          })
          .filter((stat) => !!stat)
        let mtimes = stats.map((stat) => stat.mtime.getTime() / 1000)
        let latest = mtimes.sort().slice(-1)[0]

        if (latest > latestDirty) {
          latestDirty = latest
        }
      }
    }

    return latestDirty ? `${commitHash}-${latestDirty}` : commitHash
  }

  async sortVersions(versions: string[]) {
    let getPosition = async (version) => {
      let [commitHash, dirtyTimestamp] = version.split("-")

      if (dirtyTimestamp) {
        // any dirty versions will be sorted by latest timestamp
        return -parseInt(dirtyTimestamp, 10)
      } else if (commitHash === NEW_MODULE_VERSION) {
        return 0
      } else {
        // clean versions are sorted by their commit distance from HEAD
        return await this.getOffsetFromHead(commitHash)
      }
    }
    let positions = {}

    await Bluebird.each(versions, async v => {
      positions[v] = await getPosition(v)
    })

    // TODO: surely there's a better way around this lodash quirk
    return <string[]><any>sortBy(versions, v => positions[v])
  }

  private async getCurrentBranch() {
    return (await this.git("rev-parse --abbrev-ref HEAD")).stdout.trim()
  }

  private async getOffsetFromHead(commitHash: string) {
    let res = await this.git(`rev-list --left-right --count ${commitHash}...HEAD`)
    return parseInt(res.stdout.trim().split("\t")[1], 10)
  }

  private async git(args) {
    return exec("git " + args, { cwd: this.context.projectRoot })
  }
}
