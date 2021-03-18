/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { NotFoundError } from "../../exceptions"
import { Command, CommandResult, CommandParams } from "../base"
import dedent = require("dedent")
import { StringParameter } from "../../cli/params"
import { printHeader } from "../../logger/util"

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

export class GetSecretCommand extends Command<GetArgs> {
  name = "secret"
  help = "Get a secret from the environment."
  hidden = true

  description = dedent`
    Returns with an error if the provided key could not be found.

    >**Note**: The \`get|set secret\` commands are currently quite limited.
    For Kubernetes secrets, we recommend using kubectl for
    most non-trivial use-cases.

    Examples:

        garden get secret kubernetes somekey
        garden get secret local-kubernetes some-other-key
  `

  arguments = getSecretArgs

  printHeader({ headerLog }) {
    printHeader(headerLog, "Get secret", "unlock")
  }

  async action({ garden, log, args }: CommandParams<GetArgs>): Promise<CommandResult> {
    const key = args.key
    const actions = await garden.getActionRouter()
    const { value } = await actions.getSecret({
      pluginName: args.provider,
      key,
      log,
    })

    if (value === null || value === undefined) {
      throw new NotFoundError(`Could not find config key ${key}`, { key })
    }

    log.info(value)

    return { [key]: value }
  }
}
