/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
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
import type { SecretResult } from "./secret-helpers.js"
import { makeSecretFromResponse } from "./secret-helpers.js"
import { getEnvironmentByNameOrThrow } from "./secret-helpers.js"
import type {
  BulkCreateSecretRequest,
  BulkUpdateSecretRequest,
  GardenCloudApi,
  Secret,
  SingleUpdateSecretRequest,
} from "../../../cloud/legacy/api.js"
import { handleSecretsUnavailableInNewBackend } from "../../../cloud/secrets.js"

export const secretsUpdateArgs = {
  secretNamesOrIds: new StringsParameter({
    help: deline`The names and values of the secrets to update, separated by '='.
      You may specify multiple secret name/value pairs, separated by spaces.
      You can also pass pairs of secret IDs and values if you use \`--update-by-id\` flag.
      Note that you can also leave this empty and have Garden read the secrets from file.`,
    spread: true,
  }),
}

export const secretsUpdateOpts = {
  "upsert": new BooleanParameter({
    help: deline`Set this flag to upsert secrets instead of only updating them.
    It means that the existing secrets will be updated while the missing secrets will be created.
    This flag works only while updating secrets by name, and has no effect with \`--update-by-id\` option.
    `,
    defaultValue: false,
  }),
  "update-by-id": new BooleanParameter({
    help: deline`Update secret(s) by secret ID(s).
    By default, the command args are considered to be secret name(s).
    The \`--upsert\` flag has no effect with this option.
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

    By default, the secrets are updated by name instead of secret ID.

    When updating by name, only the existing secrets are updated by default.
    The missing ones are skipped and reported as errors at the end of the command execution.
    This behavior can be customized with the \`--upsert\` flag, so the missing secrets will be created.

    If you have multiple secrets with same name across different environments and users, specify the environment and the user id using \`--scope-to-env\` and \`--scope-to-user-id\` flags.
    Otherwise, the command will fail with an error.

    To update the secrets by their IDs, use the \`--update-by-id\` flag.
    To get the IDs of the secrets you want to update, run the \`garden cloud secrets list\` command.
    The \`--upsert\` flag has no effect if it's used along with the \`--update-by-id\` flag.

    Examples:
        garden cloud secrets update MY_SECRET=foo MY_SECRET_2=bar # update two secret values with the given names.
        garden cloud secrets update MY_SECRET=foo MY_SECRET_2=bar --upsert # update two secret values with the given names and create new ones if any are missing
        garden cloud secrets update MY_SECRET=foo MY_SECRET_2=bar --scope-to-env local --scope-to-user-id <user-id> # update two secret values with the given names for the environment local and specified user id.
        garden cloud secrets update <ID 1>=foo <ID 2>=bar --update-by-id # update two secret values with the given IDs.
  `
  override arguments = secretsUpdateArgs
  override options = secretsUpdateOpts

  override printHeader({ log }) {
    printHeader(log, "Update secrets", "🔒")
  }

  async action({ garden, log, opts, args }: CommandParams<Args, Opts>): Promise<CommandResult<SecretResult[]>> {
    handleSecretsUnavailableInNewBackend(garden)

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

    const inputSecrets = await readInputKeyValueResources({
      resourceFilePath: secretsFilePath,
      resourcesFromArgs: args.secretNamesOrIds,
      resourceName: "secret",
      log: cmdLog,
    })

    const api = garden.cloudApi
    if (!api) {
      throw new ConfigurationError({ message: noApiMsg("update", "secrets") })
    }

    const typedInputSecrets: Secret[] = inputSecrets.map(([key, value]): Secret => ({ name: key, value }))

    const project = await api.getProjectByIdOrThrow({
      projectId: garden.projectId,
      projectName: garden.projectName,
    })

    const environmentId: string | undefined = getEnvironmentByNameOrThrow({ envName: environmentName, project })?.id

    const { secretsCreateRequest, secretsUpdateRequest } = await prepareSecretsRequests({
      api,
      environmentId,
      environmentName,
      inputSecrets: typedInputSecrets,
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

    const { errors: updateErrors, results: updateResults } = await api.updateSecrets({
      request: secretsUpdateRequest,
      log,
    })

    const { errors: creationErrors, results: creationResults } = await api.createSecrets({
      request: secretsCreateRequest,
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
  api: GardenCloudApi
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

  const allSecrets = await api.fetchAllSecrets(projectId, log)

  let secretsToCreate: Secret[]
  let secretsToUpdate: SingleUpdateSecretRequest[]
  if (updateById) {
    if (upsert) {
      log.warn(`Updating secrets by IDs. Flag --upsert has no effect when it's used with --update-by-id.`)
    }

    const inputSecretDict = fromPairs(inputSecrets.map((s) => [s.name, s.value]))
    // update secrets by ids
    secretsToUpdate = sortBy(allSecrets, "name")
      .filter((existingSecret) => !!inputSecretDict[existingSecret.id])
      .map((existingSecret) => {
        const updateSecretsPayload: SingleUpdateSecretRequest = {
          id: existingSecret.id,
          environmentId: existingSecret.environment?.id,
          userId: existingSecret.user?.id,
          name: existingSecret.name,
          value: inputSecretDict[existingSecret.id],
        }
        return updateSecretsPayload
      })
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
}): Promise<SingleUpdateSecretRequest[]> {
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

  return filteredSecrets.map((existingSecret) => {
    const updateSecretsPayload: SingleUpdateSecretRequest = {
      id: existingSecret.id,
      environmentId: existingSecret.environment?.id,
      userId: existingSecret.user?.id,
      name: existingSecret.name,
      value: inputSecretDict[existingSecret.name],
    }
    return updateSecretsPayload
  })
}

export function getSecretsToCreate(inputSecrets: Secret[], secretsToUpdate: SingleUpdateSecretRequest[]): Secret[] {
  const secretToUpdateIds = new Set(secretsToUpdate.map((secret) => secret.name))
  return inputSecrets.filter((inputSecret) => !secretToUpdateIds.has(inputSecret.name))
}
