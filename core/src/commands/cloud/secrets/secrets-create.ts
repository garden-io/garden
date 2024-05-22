/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { CommandError, ConfigurationError, CloudApiError, GardenError } from "../../../exceptions.js"
import type { CreateSecretResponse } from "@garden-io/platform-api-types"
import { printHeader } from "../../../logger/util.js"
import type { CommandParams, CommandResult } from "../../base.js"
import { Command } from "../../base.js"
import type { ApiCommandError } from "../helpers.js"
import { handleBulkOperationResult, noApiMsg } from "../helpers.js"
import { dedent, deline } from "../../../util/string.js"
import { PathParameter, StringParameter, StringsParameter } from "../../../cli/params.js"
import type { SecretResult } from "./secret-helpers.js"
import { getEnvironmentByNameOrThrow } from "./secret-helpers.js"
import { readInputSecrets } from "./secret-helpers.js"
import { makeSecretFromResponse } from "./secret-helpers.js"
import { enumerate } from "../../../util/enumerate.js"

export const secretsCreateArgs = {
  secrets: new StringsParameter({
    help: deline`The names and values of the secrets to create, separated by '='.
      You may specify multiple secret name/value pairs, separated by spaces. Note
      that you can also leave this empty and have Garden read the secrets from file.`,
    spread: true,
  }),
}

export const secretsCreateOpts = {
  "scope-to-user-id": new StringParameter({
    help: deline`Scope the secret to a user with the given ID. User scoped secrets must be scoped to an environment as well.`,
  }),
  "scope-to-env": new StringParameter({
    help: deline`Scope the secret to an environment. Note that this does not default to the environment
    that the command runs in (i.e. the one set via the --env flag) and that you need to set this explicitly if
    you want to create an environment scoped secret.
    `,
  }),
  "from-file": new PathParameter({
    help: deline`Read the secrets from the file at the given path. The file should have standard "dotenv"
    format, as defined by [dotenv](https://github.com/motdotla/dotenv#rules).`,
  }),
}

type Args = typeof secretsCreateArgs
type Opts = typeof secretsCreateOpts

export class SecretsCreateCommand extends Command<Args, Opts> {
  name = "create"
  help = "Create secrets in Garden Cloud."
  override description = dedent`
    Create secrets in Garden Cloud. You can create project wide secrets or optionally scope
    them to an environment, or an environment and a user.

    To scope secrets to a user, you will need the user's ID which you can get from the
    \`garden cloud users list\` command.

    You can optionally read the secrets from a file.

    Examples:
        garden cloud secrets create DB_PASSWORD=my-pwd ACCESS_KEY=my-key   # create two secrets
        garden cloud secrets create ACCESS_KEY=my-key --scope-to-env ci    # create a secret and scope it to the ci environment
        garden cloud secrets create ACCESS_KEY=my-key --scope-to-env ci --scope-to-user 9  # create a secret and scope it to the ci environment and user with ID 9
        garden cloud secrets create --from-file /path/to/secrets.txt  # create secrets from the key value pairs in the secrets.txt file
  `

  override arguments = secretsCreateArgs
  override options = secretsCreateOpts

  override printHeader({ log }) {
    printHeader(log, "Create secrets", "🔒")
  }

  async action({ garden, log, opts, args }: CommandParams<Args, Opts>): Promise<CommandResult<SecretResult[]>> {
    // Apparently TS thinks that optional params are always defined so we need to cast them to their
    // true type here.
    const envName = opts["scope-to-env"] as string | undefined
    const userId = opts["scope-to-user-id"] as string | undefined
    const secretsFilePath = opts["from-file"] as string | undefined

    if (userId !== undefined && !envName) {
      throw new CommandError({
        message: `Got user ID but not environment name. Secrets scoped to users must be scoped to environments as well.`,
      })
    }

    const secrets = await readInputSecrets({ secretsFilePath, secretsFromArgs: args.secrets })

    const api = garden.cloudApi
    if (!api) {
      throw new ConfigurationError({ message: noApiMsg("create", "secrets") })
    }

    const project = await api.getProjectByIdOrThrow({
      projectId: garden.projectId,
      projectName: garden.projectName,
    })

    const environmentId: string | undefined = getEnvironmentByNameOrThrow({ envName, project })?.id

    // Validate that a user with this ID exists
    if (userId) {
      const user = await api.get(`/users/${userId}`)
      if (!user) {
        throw new CloudApiError({
          message: `User with ID ${userId} not found.`,
        })
      }
    }

    const secretsToCreate = Object.entries(secrets)
    const cmdLog = log.createLog({ name: "secrets-command" })
    cmdLog.info("Creating secrets...")

    const errors: ApiCommandError[] = []
    const results: SecretResult[] = []
    for (const [counter, [name, value]] of enumerate(secretsToCreate, 1)) {
      cmdLog.info({ msg: `Creating secrets... → ${counter}/${secretsToCreate.length}` })
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

    return handleBulkOperationResult({
      log,
      cmdLog,
      action: "create",
      resource: "secret",
      errors,
      results,
    })
  }
}
