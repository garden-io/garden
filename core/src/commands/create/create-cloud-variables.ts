/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { CommandError, ConfigurationError } from "../../exceptions.js"
import { printHeader } from "../../logger/util.js"
import type { CommandParams, CommandResult } from "../base.js"
import { Command } from "../base.js"
import { handleBulkOperationResult, noApiMsg, readInputKeyValueResources, throwIfLegacyCloud } from "../helpers.js"
import { dedent } from "../../util/string.js"
import { PathParameter, StringParameter, StringsParameter, BooleanParameter, StringOption } from "../../cli/params.js"
import { joi, joiArray } from "../../config/common.js"
import { makeDocsLinkPlain } from "../../docs/common.js"

export const createCloudVariablesArgs = {
  "variable-list-id": new StringParameter({
    help: dedent`
      The ID of the variable list to create the variables in. You can use the \`garden get variable-list\` to
      look up the variable list IDs.
    `,
  }),
  "variables": new StringsParameter({
    help: dedent`
      The names and values of the variables to create, separated by '='. You may specify multiple
      variable name/value pairs, separated by spaces. Note that you can also leave this empty
      and have Garden read the variables from file.`,
    spread: true,
  }),
}

export const createCloudVariablesOpts = {
  "scope-to-user-id": new StringOption({
    help: dedent`
      Scope the variable to a user with the given ID. User scoped variables must be scoped to an environment as well.
    `,
  }),
  "scope-to-env": new StringOption({
    help: dedent`
      Scope the variable to an environment. Note that this does not default to the environment
      that the command runs in (i.e. the one set via the --env flag) and that you need to set this explicitly if
      you want to create an environment scoped variable.
    `,
  }),
  "from-file": new PathParameter({
    help: dedent`
      Read the variables from the file at the given path. The file should have standard "dotenv"
      format, as defined by [dotenv](https://github.com/motdotla/dotenv#rules).`,
  }),
  "secret": new BooleanParameter({
    help: "Store the variable as an encrypted secret. Defaults to true.",
    defaultValue: true,
  }),
  "description": new StringOption({
    help: "Description for the variable.",
  }),
  "expires-at": new StringOption({
    help: "ISO 8601 date string for when the variable expires.",
  }),
}

type Args = typeof createCloudVariablesArgs
type Opts = typeof createCloudVariablesOpts

interface VariableResult {
  id: string
  name: string
  value: string
  description: string | null
  isSecret: boolean
  expiresAt: Date | null
  scopedAccountId: string | null
  environmentName: string | null
}

export class CreateCloudVariablesCommand extends Command<Args, Opts> {
  name = "cloud-variables"
  help = "Create remote variables in Garden Cloud."
  emoji = "☁️"

  override aliases = ["remote-variables"]

  override description = dedent`
    Create remote variables in Garden Cloud. Variables belong to variable lists, which you can get via the
    \`garden get variable-lists\` command, and can optionally be scoped to an environment,
    or an environment and a user. The variable lists themselves are also created in Garden Cloud.

    To scope variables to a user, you will need the user's ID which you can get from the
    \`garden get users\` command.

    You can optionally read the variables from a .env formatted file using --from-file.

    Examples:
        garden create cloud-variables varlist_123 DB_PASSWORD=my-pwd ACCESS_KEY=my-key   # create two variables
        garden create cloud-variables varlist_123 ACCESS_KEY=my-key --scope-to-env ci    # create a variable and scope it to the ci environment
        garden create cloud-variables varlist_123 ACCESS_KEY=my-key --scope-to-env ci --scope-to-user <user-id>  # create a variable and scope it to the ci environment and user
        garden create cloud-variables varlist_123 --from-file /path/to/variables.env  # create variables from the key value pairs in the variables.env file
        garden create cloud-variables varlist_123 SECRET_KEY=my-secret --secret=false  # create a non-secret variable

    See the [Variables and Templating guide](${makeDocsLinkPlain`features/variables-and-templating`}) for more information.
  `

  override arguments = createCloudVariablesArgs
  override options = createCloudVariablesOpts
  override hidden = true

  override printHeader({ log }) {
    printHeader(log, "Create remote variables", "☁️")
  }

  override outputsSchema = () =>
    joi.object().keys({
      variables: joiArray(
        joi.object().keys({
          id: joi.string(),
          name: joi.string(),
          value: joi.string(),
          description: joi.string().allow(null),
          isSecret: joi.boolean(),
          expiresAt: joi.date().allow(null),
          scopedAccountId: joi.string().allow(null),
          environmentName: joi.string().allow(null),
        })
      ).description("A list of created variables"),
    })

  async action({ garden, log, opts, args }: CommandParams<Args, Opts>): Promise<CommandResult<VariableResult[]>> {
    throwIfLegacyCloud(garden, "garden cloud secrets create")

    if (!garden.cloudApi) {
      throw new ConfigurationError({ message: noApiMsg("create", "variables") })
    }

    const envName = opts["scope-to-env"]
    const userId = opts["scope-to-user-id"]
    const variablesFilePath = opts["from-file"]
    const isSecret = opts["secret"]
    const description = opts["description"]
    const expiresAt = opts["expires-at"]
    const variableListId = args["variable-list-id"]

    if (userId !== undefined && !envName) {
      throw new CommandError({
        message: `Got user ID but not environment name. Variables scoped to users must be scoped to environments as well.`,
      })
    }

    const cmdLog = log.createLog({ name: "variables-command" })

    const inputVariables = await readInputKeyValueResources({
      resourceFilePath: variablesFilePath,
      resourcesFromArgs: args.variables,
      resourceName: "variable",
      log: cmdLog,
    })

    const results: VariableResult[] = []
    const errors: { identifier: string; message?: string }[] = []

    let counter = 1
    for (const [name, value] of inputVariables) {
      cmdLog.info({ msg: `Creating variables ${counter}/${inputVariables.length}` })
      counter += 1
      try {
        const response = await garden.cloudApi.trpc.variable.create.mutate({
          organizationId: garden.cloudApi.organizationId,
          variableListId,
          name,
          value,
          description: description || null,
          isSecret: isSecret || false,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          scopedAccountId: userId || null,
          scopedGardenEnvironmentId: null,
          scopedGardenEnvironmentName: envName || null,
        })

        results.push({
          id: response.id,
          name,
          value: isSecret ? "<secret>" : value,
          description: description || null,
          isSecret: isSecret || false,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          scopedAccountId: userId || null,
          environmentName: envName || null,
        })
      } catch (err) {
        errors.push({
          identifier: name,
          message: err instanceof Error ? err.message : String(err),
        })
      }
    }

    log.info("")
    return handleBulkOperationResult({
      log,
      cmdLog,
      action: "create",
      resource: "variable",
      errors,
      results,
    })
  }
}
