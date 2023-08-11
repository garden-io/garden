import { createReadStream, lstat, readlink } from "fs-extra"
import hasha from "hasha"
import { PassThrough } from "stream"
import { pipeline } from "stream/promises"


module.exports = async function({ path }: { path: string }): Promise<string> {
    const start = performance.now()
    const hash = hasha.stream({ algorithm: "sha1" })
    const stats = await lstat(path)

    if (stats.isSymbolicLink()) {
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
      const stream = new PassThrough()
      stream.push(`blob ${stats.size}\0`)

      try {
        await pipeline(createReadStream(path), stream, hash)
        const output = hash.read()
        return output
      } catch (err) {
        // Ignore file read error
        return ""
      }
    }
}
