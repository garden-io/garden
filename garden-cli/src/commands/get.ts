/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as yaml from "js-yaml"
import { NotFoundError } from "../exceptions"
import { ContextStatus } from "../plugin-context"
import { highlightYaml } from "../util/util"
import {
  Command,
  CommandResult,
  CommandParams,
  ParameterValues,
  StringParameter,
} from "./base"
import dedent = require("dedent")

export class GetCommand extends Command {
  name = "get"
  help = "Retrieve and output data and objects, e.g. configuration variables, status info etc."

  subCommands = [
    GetConfigCommand,
    GetStatusCommand,
  ]

  async action() { return {} }
}

export const getConfigArgs = {
  key: new StringParameter({
    help: "The key of the configuration variable. Separate with dots to get a nested key (e.g. key.nested).",
    required: true,
  }),
}

export type GetArgs = ParameterValues<typeof getConfigArgs>

// TODO: allow omitting key to return all configs

export class GetConfigCommand extends Command<typeof getConfigArgs> {
  name = "config"
  help = "Get a configuration variable from the environment."

  description = dedent`
    Returns with an error if the provided key could not be found in the configuration.

    Examples:

        garden get config somekey
        garden get config some.nested.key
  `

  arguments = getConfigArgs

  async action({ ctx, args }: CommandParams<GetArgs>): Promise<CommandResult> {
    const key = args.key.split(".")
    const { value } = await ctx.getConfig({ key })

    if (value === null || value === undefined) {
      throw new NotFoundError(`Could not find config key ${args.key}`, { key })
    }

    ctx.log.info(value)

    return { [args.key]: value }
  }
}

export class GetStatusCommand extends Command {
  name = "status"
  help = "Outputs the status of your environment."

  async action({ ctx }: CommandParams): Promise<CommandResult<ContextStatus>> {
    const status = await ctx.getStatus()
    const yamlStatus = yaml.safeDump(status, { noRefs: true, skipInvalid: true })

    // TODO: do a nicer print of this by default and add --yaml/--json options (maybe globally) for exporting
    ctx.log.info(highlightYaml(yamlStatus))

    return { result: status }
  }
}
