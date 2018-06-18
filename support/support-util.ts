import Axios from "axios"
import { createHash } from "crypto"

export async function getUrlChecksum(url: string, algorithm = "sha256") {
  const response = await Axios({
    method: "GET",
    url,
    responseType: "stream",
  })

  return new Promise((resolve, reject) => {
    const hash = createHash(algorithm)

    response.data.on("data", (chunk) => {
      hash.update(chunk)
    })

    response.data.on("end", () => {
      resolve(hash.digest("hex"))
    })

    response.data.on("error", reject)
  })
}
