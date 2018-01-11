import * as fs from "fs"
import * as path from "path"
import { sortBy } from "lodash"
import * as Bluebird from "bluebird"
import { exec } from "child-process-promise"

const NEW_MODULE_VERSION = "0000000000"

export class GitHandler {
  constructor(private gitRoot: string) { }

  async git(...args: string[]) {
    return exec("git " + args, { cwd: this.gitRoot })
  }

  async getCurrentBranch() {
    return (await this.git("rev-parse --abbrev-ref HEAD")).stdout.trim()
  }

  async getOffsetFromHead(commitHash: string) {
    const res = await this.git(`rev-list --left-right --count ${commitHash}...HEAD`)
    return parseInt(res.stdout.trim().split("\t")[1], 10)
  }

  async getTreeVersion(directories: string[]) {
    let res = await this.git(`rev-list -1 --abbrev-commit --abbrev=10 HEAD ${directories.join(" ")}`)
    const commitHash = res.stdout.trim() || NEW_MODULE_VERSION
    let latestDirty = 0

    for (const directory of directories) {
      res = await this.git(
        `diff-index --name-only HEAD ${directory} && git ls-files --other --exclude-standard ${directory}`,
      )

      const dirtyFiles = res.stdout.trim().split("\n").filter((f) => f.length > 0)

      if (dirtyFiles.length) {
        // for dirty trees, we append the last modified time of last modified or added file
        const stats = dirtyFiles
          .map((file) => {
            const filePath = path.join(this.gitRoot, file)
            return fs.existsSync(filePath) ? fs.statSync(filePath) : null
          })
          .filter((stat) => !!stat)
        const mtimes = stats.map((stat) => stat.mtime.getTime() / 1000)
        const latest = mtimes.sort().slice(-1)[0]

        if (latest > latestDirty) {
          latestDirty = latest
        }
      }
    }

    return latestDirty ? `${commitHash}-${latestDirty}` : commitHash
  }

  async sortVersions(versions: string[]) {
    const getPosition = async (version) => {
      const [commitHash, dirtyTimestamp] = version.split("-")

      if (dirtyTimestamp) {
        // any dirty versions will be sorted by latest timestamp
        return -parseInt(dirtyTimestamp, 10)
      } else {
        // clean versions are sorted by their commit distance from HEAD
        return await this.getOffsetFromHead(commitHash)
      }
    }
    const positions = {}

    await Bluebird.each(versions, async v => {
      positions[v] = await getPosition(v)
    })

    return sortBy(versions, v => positions[v])
  }
}
