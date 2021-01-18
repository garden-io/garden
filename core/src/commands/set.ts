/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, CommandResult, CommandParams, CommandGroup } from "./base"
import dedent = require("dedent")
import { SetSecretResult } from "../types/plugin/provider/setSecret"
import { StringParameter } from "../cli/params"
import { printHeader } from "../logger/util"

export class SetCommand extends CommandGroup {
  name = "set"
  help = "Set or modify data, e.g. secrets."
  hidden = true

  subCommands = [SetSecretCommand]
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
  hidden = true

  description = dedent`
    These secrets are handled by each provider, and may for example be exposed as environment
    variables for services or mounted as files, depending on how the provider is implemented
    and configured.

    The value is currently always stored as a string.

    >**Note**: The \`get|set secret\` commands are currently quite limited.
    For Kubernetes secrets, we recommend using kubectl for
    most non-trivial use-cases.

    Examples:

        garden set secret kubernetes somekey myvalue
        garden set secret local-kubernets somekey myvalue
  `

  arguments = setSecretArgs

  printHeader({ headerLog }) {
    printHeader(headerLog, "Set secret", "lock")
  }

  async action({ garden, log, args }: CommandParams<SetArgs>): Promise<CommandResult<SetSecretResult>> {
    const key = args.key
    const actions = await garden.getActionRouter()
    const result = await actions.setSecret({
      pluginName: args.provider,
      key,
      value: args.value,
      log,
    })
    log.info(`Set config key ${args.key}`)
    return { result }
  }
}
