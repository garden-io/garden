import "../setup"
import kms from "@google-cloud/kms"
import { readFile } from "fs-extra"

const projectId = "garden-dev-200012"
const keyRingId = "dev"
const cryptoKeyId = "dev"
const locationId = "global"

/**
 * Decrypt a secret file, encrypted with our Google Cloud KMS key.
 */
export async function decryptSecretFile(path: string) {
  const client = new kms.KeyManagementServiceClient()

  const name = client.cryptoKeyPath(projectId, locationId, keyRingId, cryptoKeyId)
  const ciphertext = await readFile(path)
  const [result] = await client.decrypt({ name, ciphertext })

  return result.plaintext
}
