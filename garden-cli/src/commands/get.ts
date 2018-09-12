/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as yaml from "js-yaml"
import { NotFoundError } from "../exceptions"
import { highlightYaml } from "../util/util"
import {
  Command,
  CommandResult,
  CommandParams,
  StringParameter,
} from "./base"
import dedent = require("dedent")
import { ContextStatus } from "../actions"

export class GetCommand extends Command {
  name = "get"
  help = "Retrieve and output data and objects, e.g. secrets, status info etc."

  subCommands = [
    GetSecretCommand,
    GetStatusCommand,
  ]

  async action() { return {} }
}

const getSecretArgs = {
  provider: new StringParameter({
    help: "The name of the provider to read the secret from.",
    required: true,
  }),
  key: new StringParameter({
    help: "The key of the configuration variable.",
    required: true,
  }),
}

type GetArgs = typeof getSecretArgs

// TODO: allow omitting key to return all configs

export class GetSecretCommand extends Command<typeof getSecretArgs> {
  name = "secret"
  help = "Get a secret from the environment."

  description = dedent`
    Returns with an error if the provided key could not be found.

    Examples:

        garden get secret kubernetes somekey
        garden get secret local-kubernetes some-other-key
  `

  arguments = getSecretArgs

  async action({ garden, args }: CommandParams<GetArgs>): Promise<CommandResult> {
    const key = args.key
    const { value } = await garden.actions.getSecret({ pluginName: args.provider, key })

    if (value === null || value === undefined) {
      throw new NotFoundError(`Could not find config key ${key}`, { key })
    }

    garden.log.info(value)

    return { [key]: value }
  }
}

export class GetStatusCommand extends Command {
  name = "status"
  help = "Outputs the status of your environment."

  async action({ garden }: CommandParams): Promise<CommandResult<ContextStatus>> {
    const status = await garden.actions.getStatus()
    const yamlStatus = yaml.safeDump(status, { noRefs: true, skipInvalid: true })

    // TODO: do a nicer print of this by default and add --yaml/--json options (maybe globally) for exporting
    garden.log.info(highlightYaml(yamlStatus))

    return { result: status }
  }
}
