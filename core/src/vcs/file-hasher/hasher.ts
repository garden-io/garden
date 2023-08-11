import { Stats, readlink } from "fs-extra"
import hasha = require("hasha")
import { resolve } from "path"
import Piscina = require("piscina")

const workerPool = new Piscina({
  filename: resolve(__dirname, "worker.js"),
})

export function createHasher() {
  const abortController = new AbortController()
  return {
    /**
     * Replicates the `git hash-object` behavior. See https://stackoverflow.com/a/5290484/3290965
     * We deviate from git's behavior when dealing with symlinks, by hashing the target of the symlink and not the
     * symlink itself. If the symlink cannot be read, we hash the link contents like git normally does.
     */
    hashObject: async (stats: Stats, path: string): Promise<string> => {
      if (stats.isSymbolicLink()) {
        const hash = hasha.stream({ algorithm: "sha1" })
        // For symlinks, we follow git's behavior, which is to hash the link itself (i.e. the path it contains) as
        // opposed to the file/directory that it points to.
        try {
          const linkPath = await readlink(path)
          hash.update(`blob ${stats.size}\0${linkPath}`)
          hash.end()
          const output = hash.read()
          return output
        } catch (err) {
          // Ignore errors here, just output empty h°ash
          return ""
        }
      } else {
        const task = workerPool.run({ size: stats.size, path }, { signal: abortController.signal })
        return await task
      }
    },
    abortHashing: () => {
      abortController.abort()
    },
  }
}
