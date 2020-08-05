/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

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

  return result.plaintext!
}
