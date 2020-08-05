#!/usr/bin/env ts-node

/**
 * Helper script for encrypting files and storing them in the repository. Uses Google Cloud KMS (which devs should
 * have access to anyway) to encrypt the data, such that it's safe to commit the file to git.
 *
 * Usage example: `echo "my data" | ./scripts/encrypt-file.ts filename.txt`
 */

import kms from "@google-cloud/kms"
import { writeFile } from "fs-extra"
import { resolve } from "path"

const projectId = "garden-dev-200012"
const keyRingId = "dev"
const cryptoKeyId = "dev"
const locationId = "global"

async function encrypt(filename: string, plaintext: Buffer) {
  const client = new kms.KeyManagementServiceClient()

  const name = client.cryptoKeyPath(
    projectId,
    locationId,
    keyRingId,
    cryptoKeyId
  )

  const [result] = await client.encrypt({ name, plaintext })

  const outputPath = resolve(__dirname, "..", "secrets", filename)
  await writeFile(outputPath, result.ciphertext)

  console.log(
    `Encrypted input, result saved to ${outputPath}`
  )
}

const args = process.argv.slice(2)
const filename = args[0]

if (require.main === module) {
  process.stdin.resume()

  let data = Buffer.from("")

  process.stdin.on("data", (chunk) => {
    data = Buffer.concat([data, chunk])
  })

  process.stdin.on("end", function() {
    encrypt(filename, data).catch((err) => {
      console.error(err)
      process.exit(1)
    })
  })
}
