/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { SecretResult as SecretResultApi } from "@garden-io/platform-api-types"
import type { StringMap } from "../../../config/common.js"
import dotenv from "dotenv"
import fsExtra from "fs-extra"
import { CommandError } from "../../../exceptions.js"
import { dedent } from "../../../util/string.js"

const { readFile } = fsExtra

export interface SecretResult {
  id: string
  createdAt: string
  updatedAt: string
  name: string
  environment?: {
    name: string
    id: string
  }
  user?: {
    name: string
    id: string
    vcsUsername: string
  }
}

export function makeSecretFromResponse(res: SecretResultApi): SecretResult {
  const secret = {
    name: res.name,
    id: res.id,
    updatedAt: res.updatedAt,
    createdAt: res.createdAt,
  }
  if (res.environment) {
    secret["environment"] = {
      name: res.environment.name,
      id: res.environment.id,
    }
  }
  if (res.user) {
    secret["user"] = {
      name: res.user.name,
      id: res.user.id,
      vcsUsername: res.user.vcsUsername,
    }
  }
  return secret
}

export async function readInputSecrets({
  secretsFromFile,
  secretsFromArgs,
}: {
  secretsFromFile: string | undefined
  secretsFromArgs: string[] | undefined
}): Promise<StringMap> {
  // TODO: --from-file takes implicit precedence over args.
  //  Document this or allow both, or throw an error if both sources are defined.
  if (secretsFromFile) {
    try {
      const secretsFileContent = await readFile(secretsFromFile)
      return dotenv.parse(secretsFileContent)
    } catch (err) {
      throw new CommandError({
        message: `Unable to read secrets from file at path ${secretsFromFile}: ${err}`,
      })
    }
  } else if (secretsFromArgs) {
    return secretsFromArgs.reduce((acc, keyValPair) => {
      try {
        const secret = dotenv.parse(keyValPair)
        Object.assign(acc, secret)
        return acc
      } catch (err) {
        throw new CommandError({
          message: `Unable to read secret from argument ${keyValPair}: ${err}`,
        })
      }
    }, {})
  }

  throw new CommandError({
    message: dedent`
        No secrets provided. Either provide secrets directly to the command or via the --from-file flag.
      `,
  })
}
