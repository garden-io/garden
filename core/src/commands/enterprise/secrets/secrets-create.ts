/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { CommandError, ConfigurationError, EnterpriseApiError } from "../../../exceptions"
import { CreateSecretResponse } from "@garden-io/platform-api-types"
import dotenv = require("dotenv")
import { readFile } from "fs-extra"

import { printHeader } from "../../../logger/util"
import { Command, CommandParams, CommandResult } from "../../base"
import {
  ApiCommandError,
  getProject,
  handleBulkOperationResult,
  makeSecretFromResponse,
  noApiMsg,
  SecretResult,
} from "../helpers"
import { dedent, deline } from "../../../util/string"
import { StringsParameter, PathParameter, IntegerParameter, StringParameter } from "../../../cli/params"
import { StringMap } from "../../../config/common"

export const secretsCreateArgs = {
  secrets: new StringsParameter({
    help: deline`The names and values of the secrets to create, separated by '='.
      Use comma as a separator to specify multiple secret name/value pairs. Note
      that you can also leave this empty and have Garden read the secrets from file.`,
  }),
}

export const secretsCreateOpts = {
  "scope-to-user-id": new IntegerParameter({
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
  help = "[EXPERIMENTAL] Create secrets"
  description = dedent`
    Create secrets in Garden Enterprise. You can create project wide secrets or optionally scope
    them to an environment, or an environment and a user.

    To scope secrets to a user, you will need the user's ID which you can get from the
    \`garden enterprise users list\` command.

    You can optionally read the secrets from a file.

    Examples:
        garden enterprise secrets create DB_PASSWORD=my-pwd,ACCESS_KEY=my-key   # create two secrets
        garden enterprise secrets create ACCESS_KEY=my-key --scope-to-env ci    # create a secret and scope it to the ci environment
        garden enterprise secrets create ACCESS_KEY=my-key --scope-to-env ci --scope-to-user 9  # create a secret and scope it to the ci environment and user with ID 9
        garden enterprise secrets create --from-file /path/to/secrets.txt  # create secrets from the key value pairs in the secrets.txt file
  `

  arguments = secretsCreateArgs
  options = secretsCreateOpts

  printHeader({ headerLog }) {
    printHeader(headerLog, "Create secrets", "lock")
  }

  async action({ garden, log, opts, args }: CommandParams<Args, Opts>): Promise<CommandResult<SecretResult[]>> {
    // Apparently TS thinks that optional params are always defined so we need to cast them to their
    // true type here.
    const envName = opts["scope-to-env"] as string | undefined
    const userId = opts["scope-to-user-id"] as number | undefined
    const fromFile = opts["from-file"] as string | undefined
    let secrets: StringMap

    if (userId !== undefined && !envName) {
      throw new CommandError(
        `Got user ID but not environment name. Secrets scoped to users must be scoped to environments as well.`,
        {
          args,
          opts,
        }
      )
    }

    if (fromFile) {
      try {
        secrets = dotenv.parse(await readFile(fromFile))
      } catch (err) {
        throw new CommandError(`Unable to read secrets from file at path ${fromFile}: ${err.message}`, {
          args,
          opts,
        })
      }
    } else if (args.secrets) {
      secrets = args.secrets.reduce((acc, keyValPair) => {
        const parts = keyValPair.split("=")
        acc[parts[0]] = parts[1]
        return acc
      }, {})
    } else {
      throw new CommandError(
        dedent`
        No secrets provided. Either provide secrets directly to the command or via the --from-file flag.
      `,
        { args, opts }
      )
    }

    const api = garden.enterpriseApi
    if (!api) {
      throw new ConfigurationError(noApiMsg("create", "secrets"), {})
    }

    const project = await getProject(api, api.projectId)
    let environmentId: number | undefined

    if (envName) {
      const environment = project.environments.find((e) => e.name === envName)
      if (!environment) {
        throw new EnterpriseApiError(`Environment with name ${envName} not found in project`, {
          environmentName: envName,
          availableEnvironmentNames: project.environments.map((e) => e.name),
        })
      }
      environmentId = environment.id
    }

    // Validate that a user with this ID exists
    if (userId) {
      const user = await api.get(`/users/${userId}`)
      if (!user) {
        throw new EnterpriseApiError(`User with ID ${userId} not found.`, {
          userId,
        })
      }
    }

    const secretsToCreate = Object.entries(secrets)
    const cmdLog = log.info({ status: "active", section: "secrets-command", msg: "Creating secrets..." })

    let count = 1
    const errors: ApiCommandError[] = []
    const results: SecretResult[] = []
    for (const [name, value] of secretsToCreate) {
      cmdLog.setState({ msg: `Creating secrets... → ${count}/${secretsToCreate.length}` })
      count++
      try {
        const body = { environmentId, userId, projectId: project.id, name, value }
        const res = await api.post<CreateSecretResponse>(`/secrets`, { body })
        results.push(makeSecretFromResponse(res.data))
      } catch (err) {
        errors.push({
          identifier: name,
          message: err?.response?.body?.message || err.messsage,
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
