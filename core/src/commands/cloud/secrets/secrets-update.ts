/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CreateSecretResponse, UpdateSecretResponse } from "@garden-io/platform-api-types"
import { pickBy, sortBy, uniqBy } from "lodash-es"
import { BooleanParameter, PathParameter, StringParameter, StringsParameter } from "../../../cli/params.js"
import type { CloudProject } from "../../../cloud/api.js"
import type { StringMap } from "../../../config/common.js"
import { CloudApiError, CommandError, ConfigurationError, GardenError } from "../../../exceptions.js"
import { printHeader } from "../../../logger/util.js"
import { dedent, deline } from "../../../util/string.js"
import type { CommandParams, CommandResult } from "../../base.js"
import { Command } from "../../base.js"
import type { ApiCommandError } from "../helpers.js"
import { handleBulkOperationResult, noApiMsg } from "../helpers.js"
import { fetchAllSecrets } from "./secrets-list.js"
import type { Log } from "../../../logger/log-entry.js"
import type { SecretResult } from "./secret-helpers.js"
import { readInputSecrets } from "./secret-helpers.js"
import { makeSecretFromResponse } from "./secret-helpers.js"

export const secretsUpdateArgs = {
  secretNamesOrIds: new StringsParameter({
    help: deline`The name(s) or ID(s) of the secrets to update along with the new values, separated by '='.
      You may specify multiple secret id/value pairs, separated by spaces. `,
    spread: true,
  }),
}

export const secretsUpdateOpts = {
  "upsert": new BooleanParameter({
    help: "Set this flag to upsert secrets instead of updating them. I.e., existing secrets will be updated while missing secrets will be created.",
    defaultValue: false,
  }),
  "update-by-id": new BooleanParameter({
    help: deline`Update secret(s) by secret ID(s).
      By default, the command args are considered to be secret name(s).
    `,
    defaultValue: false,
  }),
  "from-file": new PathParameter({
    help: deline`Read the secrets from the file at the given path.
    The file should have standard "dotenv" format, as defined by [dotenv](https://github.com/motdotla/dotenv#rules).`,
  }),
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
}

type Args = typeof secretsUpdateArgs
type Opts = typeof secretsUpdateOpts

export class SecretsUpdateCommand extends Command<Args, Opts> {
  name = "update"
  help = "Update secrets in Garden Cloud"
  override description = dedent`
    Update secrets in Garden Cloud. You can update the secrets by either specifying secret name or secret ID.
    When updating by name, the behavior is upsert (existing secrets are updated while missing secrets are created).

    If you have multiple secrets with same name across different environments and users, specify the environment and user id using \`--scope-to-env\` and \`--scope-to-user-id\` flags.

    When you want to update the secrets by ID, use the \`--update-by-id\` flag. To get the IDs of the secrets you want to update, run the \`garden cloud secrets list\` command.

    Examples:
        garden cloud secrets update MY_SECRET=foo MY_SECRET_2=bar # update two secret values with the given names.
        garden cloud secrets update MY_SECRET=foo MY_SECRET_2=bar --scope-to-env local --scope-to-user-id <user-id> # update two secret values with the given names for the environment local and specified user id.
        garden cloud secrets update <ID 1>=foo <ID 2>=bar --update-by-id # update two secret values with the given IDs.
  `
  override arguments = secretsUpdateArgs
  override options = secretsUpdateOpts

  override printHeader({ log }) {
    printHeader(log, "Update secrets", "🔒")
  }

  async action({ garden, log, opts, args }: CommandParams<Args, Opts>): Promise<CommandResult<SecretResult[]>> {
    // Apparently TS thinks that optional params are always defined so we need to cast them to their
    // true type here.
    const envName = opts["scope-to-env"] as string | undefined
    const userId = opts["scope-to-user-id"] as string | undefined
    const secretsFilePath = opts["from-file"] as string | undefined
    const updateById = opts["update-by-id"] as boolean | undefined
    const isUpsert = opts["upsert"] as boolean | undefined

    if (!updateById && userId !== undefined && !envName) {
      throw new CommandError({
        message: `Got user ID but not environment name. Secrets scoped to users must be scoped to environments as well.`,
      })
    }

    const secretsToUpdateArgs = await readInputSecrets({ secretsFilePath, secretsFromArgs: args.secretNamesOrIds })

    const api = garden.cloudApi
    if (!api) {
      throw new ConfigurationError({ message: noApiMsg("update", "secrets") })
    }

    const project: CloudProject = await api.getProjectByIdOrThrow({
      projectId: garden.projectId,
      projectName: garden.projectName,
    })

    let environmentId: string | undefined
    if (envName) {
      const environment = project.environments.find((e) => e.name === envName)
      if (!environment) {
        throw new CloudApiError({
          message: `Environment with name ${envName} not found in project`,
        })
      }
      environmentId = environment.id
    }

    const allSecrets: SecretResult[] = await fetchAllSecrets(api, project.id, log)
    let secretsToUpdate: Array<UpdateSecretBody>
    let secretsToCreate: [string, string][] = []

    if (!updateById) {
      // update secrets by name
      secretsToUpdate = await getSecretsToUpdateByName({
        allSecrets,
        envName,
        userId,
        secretsToUpdateArgs,
        log,
      })

      if (isUpsert) {
        // if --upsert is set, check the diff between secrets to update and command args to find out
        // secrets that do not exist yet and can be created
        secretsToCreate = getSecretsToCreate(secretsToUpdateArgs, secretsToUpdate)
      }
    } else {
      // update secrets by ids
      secretsToUpdate = sortBy(allSecrets, "name")
        .filter((secret) => Object.keys(secretsToUpdateArgs).includes(secret.id))
        .map((secret) => ({ ...secret, newValue: secretsToUpdateArgs[secret.id] }))
    }

    if (secretsToUpdate.length === 0 && secretsToCreate.length === 0) {
      throw new CommandError({
        message: `No secrets to be updated or created.`,
      })
    }

    const cmdLog = log.createLog({ name: "secrets-command" })
    if (secretsToUpdate?.length > 0) {
      cmdLog.info(`${secretsToUpdate.length} existing secret(s) to be updated.`)
    }
    if (secretsToCreate && secretsToCreate?.length > 0) {
      cmdLog.info(`${secretsToCreate.length} new secret(s) to be created.`)
    }

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
        if (!(err instanceof GardenError)) {
          throw err
        }
        errors.push({
          identifier: secret.name,
          message: err.message,
        })
      }
    }

    if (secretsToCreate && secretsToCreate.length > 0) {
      // reset counter
      count = 1
      for (const [name, value] of secretsToCreate) {
        cmdLog.info({ msg: `Creating secrets... → ${count}/${secretsToCreate.length}` })
        count++
        try {
          const body = { environmentId, userId, projectId: project.id, name, value }
          const res = await api.post<CreateSecretResponse>(`/secrets`, { body })
          results.push(makeSecretFromResponse(res.data))
        } catch (err) {
          if (!(err instanceof GardenError)) {
            throw err
          }
          errors.push({
            identifier: name,
            message: err.message,
          })
        }
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

export type UpdateSecretBody = SecretResult & { newValue: string }

export async function getSecretsToUpdateByName({
  allSecrets,
  envName,
  userId,
  secretsToUpdateArgs,
  log,
}: {
  allSecrets: SecretResult[]
  envName?: string
  userId?: string
  secretsToUpdateArgs: StringMap
  log: Log
}): Promise<Array<UpdateSecretBody>> {
  const filteredSecrets = sortBy(allSecrets, "name")
    .filter((s) => (envName ? s.environment?.name === envName : true))
    .filter((s) => (userId ? s.user?.id === userId : true))
    .filter((s) => Object.keys(secretsToUpdateArgs).includes(s.name))

  // check if there are any secret results with duplicate names
  const hasDuplicateSecretsByName = uniqBy(filteredSecrets, "name").length !== filteredSecrets.length
  if (hasDuplicateSecretsByName) {
    const duplicateSecrets = filteredSecrets
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
    })
  }
  return filteredSecrets.map((secret) => ({ ...secret, newValue: secretsToUpdateArgs[secret.name] }))
}

export function getSecretsToCreate(secretsToUpdateArgs: StringMap, secretsToUpdate: Array<UpdateSecretBody>) {
  const diffCreateAndUpdate = pickBy(
    secretsToUpdateArgs,
    (_value, key) => !secretsToUpdate.find((secret) => secret.name === key)
  )
  return diffCreateAndUpdate ? Object.entries(diffCreateAndUpdate) : []
}
