import { createReadStream } from "fs-extra"
import hasha from "hasha"
import { PassThrough } from "stream"
import { pipeline } from "stream/promises"


module.exports = async function({ size, path }: { size: number; path: string }): Promise<string> {
  const hash = hasha.stream({ algorithm: "sha1" })
  const stream = new PassThrough()
  stream.push(`blob ${size}\0`)

  try {
    await pipeline(createReadStream(path), stream, hash)
    const output = hash.read()
    return output
  } catch (err) {
    // Ignore file read error
    return ""
  }

}
