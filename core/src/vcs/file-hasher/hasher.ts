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
    hashObject: async (path: string): Promise<string> => {
      const task = workerPool.run({ path }, { signal: abortController.signal })

      return await task
    },
    abortHashing: () => {
      abortController.abort()
    },
  }
}
