/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginContext } from "../../plugin-context"
import { DeleteConfigResult } from "../../types/plugin/outputs"
import {
  Command,
  CommandResult,
  ParameterValues,
  StringParameter,
} from "../base"
import { NotFoundError } from "../../exceptions"
import dedent = require("dedent")

export const configDeleteArgs = {
  key: new StringParameter({
    help: "The key of the configuration variable. Separate with dots to get a nested key (e.g. key.nested).",
    required: true,
  }),
}

export type DeleteArgs = ParameterValues<typeof configDeleteArgs>

// TODO: add --all option to remove all configs

export class ConfigDeleteCommand extends Command<typeof configDeleteArgs> {
  name = "delete"
  alias = "del"
  help = "Delete a configuration variable from the Garden environment."

  description = dedent`
    Returns with an error if the provided key could not be found in the configuration.

    Examples:

        garden delete somekey
        garden delete some.nested.key
  `

  arguments = configDeleteArgs

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
