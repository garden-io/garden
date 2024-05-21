/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { UserResult as UserResultApi } from "@garden-io/platform-api-types"
import type { StringMap } from "../../../config/common.js"
import dotenv from "dotenv"
import fsExtra from "fs-extra"
import { CommandError } from "../../../exceptions.js"
import { dedent } from "../../../util/string.js"

const { readFile } = fsExtra

export interface UserResult {
  id: string
  createdAt: string
  updatedAt: string
  name: string
  vcsUsername: string | null | undefined
  groups: {
    id: string
    name: string
  }[]
}

export function makeUserFromResponse(user: UserResultApi): UserResult {
  return {
    id: user.id,
    name: user.name,
    vcsUsername: user.vcsUsername,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    groups: user.groups.map((g) => ({ id: g.id, name: g.name })),
  }
}

// TODO: extract template function and reuse it here and in `readInputSecrets(...)`.
export async function readInputUsers({
  usersFromFile,
  usersFromArgs,
}: {
  usersFromFile: string | undefined
  usersFromArgs: string[] | undefined
}): Promise<StringMap> {
  // TODO: --from-file takes implicit precedence over args.
  //  Document this or allow both, or throw an error if both sources are defined.
  if (usersFromFile) {
    try {
      const usersFileContent = await readFile(usersFromFile)
      return dotenv.parse(usersFileContent)
    } catch (err) {
      throw new CommandError({
        message: `Unable to read users from file at path ${usersFromFile}: ${err}`,
      })
    }
  } else if (usersFromArgs) {
    return usersFromArgs.reduce((acc, keyValPair) => {
      try {
        const user = dotenv.parse(keyValPair)
        Object.assign(acc, user)
        return acc
      } catch (err) {
        throw new CommandError({
          message: `Unable to read user from argument ${keyValPair}: ${err}`,
        })
      }
    }, {})
  }

  throw new CommandError({
    message: dedent`
        No users provided. Either provide users directly to the command or via the --from-file flag.
      `,
  })
}
