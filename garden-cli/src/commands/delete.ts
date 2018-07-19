/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginContext } from "../plugin-context"
import {
  DeleteConfigResult,
  EnvironmentStatusMap,
} from "../types/plugin/outputs"
import {
  Command,
  CommandResult,
  ParameterValues,
  StringParameter,
} from "./base"
import { NotFoundError } from "../exceptions"
import dedent = require("dedent")

export class DeleteCommand extends Command {
  name = "delete"
  alias = "del"
  help = "Delete configuration or objects."

  subCommands = [
    DeleteConfigCommand,
    DeleteEnvironmentCommand,
  ]

  async action() { return {} }
}

export const deleteConfigArgs = {
  key: new StringParameter({
    help: "The key of the configuration variable. Separate with dots to get a nested key (e.g. key.nested).",
    required: true,
  }),
}

export type DeleteArgs = ParameterValues<typeof deleteConfigArgs>

// TODO: add --all option to remove all configs

export class DeleteConfigCommand extends Command<typeof deleteConfigArgs> {
  name = "config"
  help = "Delete a configuration variable from the environment."

  description = dedent`
    Returns with an error if the provided key could not be found in the configuration.

    Examples:

        garden delete config somekey
        garden del config some.nested.key
  `

  arguments = deleteConfigArgs

  async action(ctx: PluginContext, args: DeleteArgs): Promise<CommandResult<DeleteConfigResult>> {
    const key = args.key.split(".")
    const result = await ctx.deleteConfig({ key })

    if (result.found) {
      ctx.log.info(`Deleted config key ${args.key}`)
    } else {
      throw new NotFoundError(`Could not find config key ${args.key}`, { key })
    }

    return { result }
  }
}

export class DeleteEnvironmentCommand extends Command {
  name = "environment"
  alias = "env"
  help = "Deletes a running environment."

  description = dedent`
    This will trigger providers to clear up any deployments in a Garden environment and reset it.
    When you then run \`garden configure env\` or any deployment command, the environment will be reconfigured.

    This can be useful if you find the environment to be in an inconsistent state, or need/want to free up
    resources.
  `

  async action(ctx: PluginContext): Promise<CommandResult<EnvironmentStatusMap>> {
    const { name } = ctx.getEnvironment()
    ctx.log.header({ emoji: "skull_and_crossbones", command: `Deleting ${name} environment` })

    const result = await ctx.destroyEnvironment({})

    ctx.log.finish()

    return { result }
  }
}
