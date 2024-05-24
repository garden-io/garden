/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { SecretResult as CloudApiSecretResult } from "@garden-io/platform-api-types"
import { fromPairs, sortBy, uniqBy } from "lodash-es"
import { BooleanParameter, PathParameter, StringParameter, StringsParameter } from "../../../cli/params.js"
import { CommandError, ConfigurationError } from "../../../exceptions.js"
import { printHeader } from "../../../logger/util.js"
import { dedent, deline } from "../../../util/string.js"
import type { CommandParams, CommandResult } from "../../base.js"
import { Command } from "../../base.js"
import { handleBulkOperationResult, noApiMsg, readInputKeyValueResources } from "../helpers.js"
import type { Log } from "../../../logger/log-entry.js"
import type { BulkCreateSecretRequest, BulkUpdateSecretRequest, Secret, SecretResult } from "./secret-helpers.js"
import { makeSecretFromResponse } from "./secret-helpers.js"
import { updateSecrets } from "./secret-helpers.js"
import { createSecrets } from "./secret-helpers.js"
import { fetchAllSecrets, getEnvironmentByNameOrThrow } from "./secret-helpers.js"
import type { CloudApi } from "../../../cloud/api.js"

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
    const environmentName = opts["scope-to-env"] as string | undefined
    const userId = opts["scope-to-user-id"] as string | undefined
    const secretsFilePath = opts["from-file"] as string | undefined
    const updateById = opts["update-by-id"] as boolean | undefined
    const upsert = opts["upsert"] as boolean | undefined

    if (!updateById && userId !== undefined && !environmentName) {
      throw new CommandError({
        message: `Got user ID but not environment name. Secrets scoped to users must be scoped to environments as well.`,
      })
    }

    const cmdLog = log.createLog({ name: "secrets-command" })

    const inputSecrets: Secret[] = (
      await readInputKeyValueResources({
        resourceFilePath: secretsFilePath,
        resourcesFromArgs: args.secretNamesOrIds,
        resourceName: "secret",
        log: cmdLog,
      })
    ).map(([key, value]) => ({ name: key, value }))

    const api = garden.cloudApi
    if (!api) {
      throw new ConfigurationError({ message: noApiMsg("update", "secrets") })
    }

    const project = await api.getProjectByIdOrThrow({
      projectId: garden.projectId,
      projectName: garden.projectName,
    })

    const environmentId: string | undefined = getEnvironmentByNameOrThrow({ envName: environmentName, project })?.id

    const { secretsCreateRequest, secretsUpdateRequest } = await prepareSecretsRequests({
      api,
      environmentId,
      environmentName,
      inputSecrets,
      log,
      projectId: project.id,
      updateById,
      upsert,
      userId,
    })

    if (secretsCreateRequest.secrets.length === 0 && secretsUpdateRequest.secrets.length === 0) {
      throw new CommandError({
        message: `No secrets to be updated or created.`,
      })
    }

    if (secretsUpdateRequest.secrets?.length > 0) {
      cmdLog.info(`${secretsUpdateRequest.secrets.length} existing secret(s) to be updated.`)
    }
    if (secretsCreateRequest.secrets && secretsCreateRequest.secrets?.length > 0) {
      cmdLog.info(`${secretsCreateRequest.secrets.length} new secret(s) to be created.`)
    }

    const { errors: updateErrors, results: updateResults } = await updateSecrets({
      request: secretsUpdateRequest,
      api,
      log,
    })

    const { errors: creationErrors, results: creationResults } = await createSecrets({
      request: secretsCreateRequest,
      api,
      log,
    })

    return handleBulkOperationResult({
      log,
      cmdLog,
      action: "update",
      resource: "secret",
      errors: [...updateErrors, ...creationErrors],
      results: [...updateResults, ...creationResults].map(makeSecretFromResponse),
    })
  }
}

async function prepareSecretsRequests(params: {
  api: CloudApi
  environmentId: string | undefined
  environmentName: string | undefined
  log: Log
  inputSecrets: Secret[]
  projectId: string
  updateById: boolean | undefined
  upsert: boolean | undefined
  userId: string | undefined
}): Promise<{ secretsCreateRequest: BulkCreateSecretRequest; secretsUpdateRequest: BulkUpdateSecretRequest }> {
  const { api, environmentId, environmentName, inputSecrets, log, projectId, updateById, upsert, userId } = params

  const allSecrets = await fetchAllSecrets(api, projectId, log)

  let secretsToCreate: Secret[]
  let secretsToUpdate: Array<UpdateSecretBody>
  if (updateById) {
    if (upsert) {
      log.warn(`Updating secrets by IDs. Flag --upsert has no effect when it's used with --update-by-id.`)
    }

    const inputSecretDict = fromPairs(inputSecrets.map((s) => [s.name, s.value]))
    // update secrets by ids
    secretsToUpdate = sortBy(allSecrets, "name")
      .filter((secret) => !!inputSecretDict[secret.id])
      .map((secret) => ({ ...secret, newValue: inputSecrets[secret.id] }))
    secretsToCreate = []
  } else {
    // update secrets by name
    secretsToUpdate = await getSecretsToUpdateByName({
      allSecrets,
      environmentName,
      userId,
      inputSecrets,
      log,
    })
    if (upsert) {
      // if --upsert is set, check the diff between secrets to update and command args to find out
      // secrets that do not exist yet and can be created
      secretsToCreate = getSecretsToCreate(inputSecrets, secretsToUpdate)
    } else {
      secretsToCreate = []
    }
  }

  return {
    secretsCreateRequest: {
      secrets: secretsToCreate,
      environmentId,
      projectId,
      userId,
    },
    secretsUpdateRequest: { secrets: secretsToUpdate },
  }
}

export type UpdateSecretBody = CloudApiSecretResult & { newValue: string }

export async function getSecretsToUpdateByName({
  allSecrets,
  environmentName,
  userId,
  inputSecrets,
  log,
}: {
  allSecrets: CloudApiSecretResult[]
  environmentName?: string
  userId?: string
  inputSecrets: Secret[]
  log: Log
}): Promise<Array<UpdateSecretBody>> {
  const inputSecretDict = fromPairs(inputSecrets.map((s) => [s.name, s.value]))

  const filteredSecrets = sortBy(allSecrets, "name")
    .filter((s) => (environmentName ? s.environment?.name === environmentName : true))
    .filter((s) => (userId ? s.user?.id === userId : true))
    .filter((s) => !!inputSecretDict[s.name])

  // check if there are any secret results with duplicate names
  const hasDuplicateSecretsByName = uniqBy(filteredSecrets, "name").length !== filteredSecrets.length
  if (hasDuplicateSecretsByName) {
    const duplicateSecrets = filteredSecrets
      .reduce((accum: Array<{ count: number; name: string; secrets: CloudApiSecretResult[] }>, val) => {
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

  return filteredSecrets.map((secret) => ({ ...secret, newValue: inputSecretDict[secret.name] }))
}

export function getSecretsToCreate(inputSecrets: Secret[], secretsToUpdate: Array<UpdateSecretBody>): Secret[] {
  const secretToUpdateIds = new Set(secretsToUpdate.map((secret) => secret.name))
  return inputSecrets.filter((inputSecret) => !secretToUpdateIds.has(inputSecret.name))
}
