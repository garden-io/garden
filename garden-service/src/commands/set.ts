/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { SetSecretResult } from "../types/plugin/outputs"
import {
  Command,
  CommandResult,
  CommandParams,
  StringParameter,
} from "./base"
import dedent = require("dedent")

export class SetCommand extends Command {
  name = "set"
  help = "Set or modify data, e.g. secrets."

  subCommands = [
    SetSecretCommand,
  ]

  async action() { return {} }
}

const setSecretArgs = {
  provider: new StringParameter({
    help: "The name of the provider to store the secret with.",
    required: true,
  }),
  key: new StringParameter({
    help: "A unique identifier for the secret.",
    required: true,
  }),
  value: new StringParameter({
    help: "The value of the secret.",
    required: true,
  }),
}

type SetArgs = typeof setSecretArgs

// TODO: allow storing data from files

export class SetSecretCommand extends Command<typeof setSecretArgs> {
  name = "secret"
  help = "Set a secret value for a provider in an environment."

  description = dedent`
    These secrets are handled by each provider, and may for example be exposed as environment
    variables for services or mounted as files, depending on how the provider is implemented
    and configured.

    _Note: The value is currently always stored as a string._

    Examples:

        garden set secret kubernetes somekey myvalue
        garden set secret local-kubernets somekey myvalue
  `

  arguments = setSecretArgs

  async action({ garden, args }: CommandParams<SetArgs>): Promise<CommandResult<SetSecretResult>> {
    const key = args.key
    const result = await garden.actions.setSecret({ pluginName: args.provider, key, value: args.value })
    garden.log.info(`Set config key ${args.key}`)
    return { result }
  }
}
