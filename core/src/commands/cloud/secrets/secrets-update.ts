/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ListSecretsResponse, UpdateSecretResponse } from "@garden-io/platform-api-types"
import { sortBy, uniqBy } from "lodash"
import { stringify } from "querystring"
import { BooleanParameter, StringParameter, StringsParameter } from "../../../cli/params"
import { CloudProject } from "../../../cloud/api"
import { StringMap } from "../../../config/common"
import { CloudApiError, CommandError, ConfigurationError } from "../../../exceptions"
import { printHeader } from "../../../logger/util"
import { dedent, deline } from "../../../util/string"
import { getCloudDistributionName } from "../../../util/util"
import { Command, CommandParams, CommandResult } from "../../base"
import { ApiCommandError, SecretResult, handleBulkOperationResult, makeSecretFromResponse, noApiMsg } from "../helpers"
import dotenv = require("dotenv")

export const secretsUpdateArgs = {
  secretNamesOrIds: new StringsParameter({
    help: deline`The name(s) or ID(s) of the secrets to update along with the new values, separated by '='.
      You may specify multiple secret id/value pairs, separated by spaces. `,
    spread: true,
  }),
}

export const secretsUpdateOpts = {
  "scope-to-user-id": new StringParameter({
    help: deline`Update the secret(s) in scope of user with the given user ID.
      This must be specified if you want to update secrets by name instead of secret ID.
    `,
  }),
  "scope-to-env": new StringParameter({
    help: deline`Update the secret(s) in scope of the specified environment.
      This must be specified if you want to update secrets by name instead of secret ID.
    `,
  }),
  "update-by-name": new BooleanParameter({
    help: deline`Update the secret(s) by providing the name(s) of secrets. By default, the command args are considered to be secret IDs.
      Make sure to also set \`--user-ud\` and \`--env\` flag if there are multiple secrets of same name across different environments or users.
    `,
    defaultValue: false,
  }),
}

type Args = typeof secretsUpdateArgs
type Opts = typeof secretsUpdateOpts

export class SecretsUpdateCommand extends Command<Args, Opts> {
  name = "update"
  help = "Update secrets in Garden Cloud"
  description = dedent`
    Update secrets in Garden Cloud. You can update the secrets by either specifying secret ID or secret name.
    To get the IDs of the secrets you want to update, run the \`garden cloud secrets list\` command.

    When you want to update the secrets by name, use the \`--update-by-name\` flag. If you have multiple secrets with same name across different environments and users, specify the environment and user id scope using \`--scope-to-env\` and \`--scope-to-user-id\` flags.

    Examples:
        garden cloud secrets update <ID 1>=somevalue <ID 2>=somevalue2 # update two secret values with the given IDs.
        garden cloud secrets update MY_SECRET=somevalue MY_SECRET_2=somevalue2 --update-by-name # update two secret values with the given names.
        garden cloud secrets update MY_SECRET=somevalue MY_SECRET_2=somevalue2 --update-by-name --scope-to-env local # update two secret values with the given names for the environment local.
        garden cloud secrets update MY_SECRET=somevalue MY_SECRET_2=somevalue2 --update-by-name --scope-to-env local --scope-to-user-id <user-id> # update two secret values with the given names for the environment local and specified user id.
  `
  arguments = secretsUpdateArgs
  options = secretsUpdateOpts

  printHeader({ log }) {
    printHeader(log, "Update secrets", "🔒")
  }

  async action({ garden, log, opts, args }: CommandParams<Args, Opts>): Promise<CommandResult<SecretResult[]>> {
    const envNameFilter = opts["scope-to-env"] as string | undefined
    const userIdFilter = opts["scope-to-user-id"] as string | undefined
    const updateByName = opts["update-by-name"] as boolean | undefined

    if (!args.secretNamesOrIds || args.secretNamesOrIds.length === 0) {
      throw new CommandError({
        message: `No secret(s) specified in command argument.`,
        detail: {
          args,
        },
      })
    }
    let secretsToUpdateArgs: StringMap
    secretsToUpdateArgs = args.secretNamesOrIds?.reduce((acc, keyValPair) => {
      try {
        const secret = dotenv.parse(keyValPair)
        Object.assign(acc, secret)
        return acc
      } catch (err) {
        throw new CommandError({
          message: `Unable to read secret from argument ${keyValPair}: ${err.message}`,
          detail: {
            args,
            opts,
          },
        })
      }
    }, {})

    const api = garden.cloudApi
    if (!api) {
      throw new ConfigurationError({ message: noApiMsg("update", "secrets"), detail: {} })
    }

    let project: CloudProject | undefined
    if (garden.projectId) {
      project = await api.getProjectById(garden.projectId)
    }

    if (!project) {
      throw new CloudApiError({
        message: `Project ${garden.projectName} is not a ${getCloudDistributionName(api.domain)} project`,
        detail: {},
      })
    }

    let page = 0
    let allSecrets: SecretResult[] = []
    let hasMore = true
    const pageLimit = 100
    while (hasMore) {
      log.debug(`Fetching page ${page}`)
      const q = stringify({ projectId: project.id, offset: page * pageLimit, limit: pageLimit })
      const res = await api.get<ListSecretsResponse>(`/secrets?${q}`)
      if (res.data.length === 0) {
        hasMore = false
      } else {
        allSecrets.push(...res.data.map((secret) => makeSecretFromResponse(secret)))
        page++
      }
    }

    let secretsToUpdate: (SecretResult & { newValue: string })[]

    if (updateByName) {
      let tmp = sortBy(allSecrets, "name")
      if (envNameFilter) {
        tmp = tmp.filter((secret) => secret.environment?.name === envNameFilter)
      }
      if (userIdFilter) {
        tmp = tmp.filter((secret) => secret.user?.id === userIdFilter)
      }
      tmp = tmp.filter((secret) => Object.keys(secretsToUpdateArgs).includes(secret.name))
      // check if there are any secret results with duplicate names
      const hasDuplicateSecretsByName = uniqBy(tmp, "name").length !== tmp.length
      if (hasDuplicateSecretsByName) {
        const duplicateSecrets = tmp
          .reduce((accum: Array<{ count: number; name: string; secrets: SecretResult[] }>, val) => {
            const dupeIndex = accum.findIndex((arrayItem) => arrayItem.name === val.name)
            if (dupeIndex === -1) {
              // Not found, so initialize.
              accum.push({
                name: val.name,
                count: 1,
                secrets: [val],
              })
            } else {
              accum[dupeIndex].count++
              accum[dupeIndex].secrets.push(val)
            }
            return accum
          }, [])
          .filter((a) => a.count > 1)
        log.verbose(`Multiple secrets with duplicate names found. ${JSON.stringify(duplicateSecrets, null, 2)}`)

        const duplicateSecretNames = duplicateSecrets.map((s) => s.name)?.join(", ")
        throw new CommandError({
          message: `Multiple secrets with the name(s) ${duplicateSecretNames} found. Either update the secret(s) by ID or use the --scope-to-env and --scope-to-user-id flags to update the scoped secret(s).`,
          detail: {
            args,
          },
        })
      }

      secretsToUpdate = tmp.map((secret) => ({ ...secret, newValue: secretsToUpdateArgs[secret.name] }))
    } else {
      secretsToUpdate = sortBy(allSecrets, "name")
        .filter((secret) => Object.keys(secretsToUpdateArgs).includes(secret.id))
        .map((secret) => ({ ...secret, newValue: secretsToUpdateArgs[secret.id] }))
    }

    if (secretsToUpdate.length === 0) {
      const secretArgTypeWord = updateByName ? "name(s)" : "ID(s)"
      throw new CommandError({
        message: `No matching secrets found in the project that match the specified secret ${secretArgTypeWord} and filters.`,
        detail: {
          args,
        },
      })
    }

    const cmdLog = log.createLog({ name: "secrets-command" })
    let count = 1
    const errors: ApiCommandError[] = []
    const results: SecretResult[] = []
    for (const secret of secretsToUpdate) {
      cmdLog.info({ msg: `Updating secrets... → ${count}/${secretsToUpdate.length}` })
      count++
      try {
        const body = {
          environmentId: secret.environment?.id,
          userId: secret.user?.id,
          projectId: project.id,
          name: secret.name,
          value: secret.newValue,
        }
        const res = await api.put<UpdateSecretResponse>(`/secrets/${secret.id}`, { body })
        results.push(makeSecretFromResponse(res.data))
      } catch (err) {
        errors.push({
          identifier: secret.name,
          message: err?.response?.body?.message || err.messsage,
        })
      }
    }

    return handleBulkOperationResult({
      log,
      cmdLog,
      action: "update",
      resource: "secret",
      errors,
      results,
    })
  }
}
