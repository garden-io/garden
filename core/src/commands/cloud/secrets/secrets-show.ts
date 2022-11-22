/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { printHeader } from "../../../logger/util"
import { dedent, deline, renderTable } from "../../../util/string"
import { Command, CommandParams, CommandResult } from "../../base"
import { applyFilter, noApiMsg, SecretResult } from "../helpers"
import chalk from "chalk"
import { sortBy } from "lodash"
import { StringParameter } from "../../../cli/params"
import { ConfigurationError } from "../../../exceptions"

interface SecretShowResult {
  name: string
  value: string
}

const secretsShowArgs = {
  secret: new StringParameter({
    help: deline`Name of the secret to show.`,
    required: true,
  }),
}

type Args = typeof secretsShowArgs

export class SecretsShowCommand extends Command<Args, {}> {
  name = "show"
  help = "[EXPERIMENTAL] Show secrets."
  description = dedent`
    Show the given secret frm Garden Cloud for the given project, environment and user triplet.

    Note that secrets can be scoped to a project, scoped to a project and an environment, or
    scoped to a project, an environment, and a user. Garden resolves secrets in that precedence
    order and it's not possible to view secrets out of that scope. You cannot e.g. view secrets
    from another user unless you assume their role.

    Examples:
        garden cloud secrets show                                          # show all secrets
  `

  arguments = secretsShowArgs

  printHeader({ headerLog }) {
    printHeader(headerLog, "Show secrets", "lock")
  }

  async action({ garden, log, args }: CommandParams<Args, {}>): Promise<CommandResult<SecretShowResult | {}>> {
    if (!garden.cloudApi) {
      throw new ConfigurationError(noApiMsg("show", "secrets"), {})
    }

    log.info("")

    if (Object.entries(garden.secrets).length === 0) {
      log.info("No secrets found in project.")
      return { result: [] }
    }

    const secret = garden.secrets[args.secret]

    if (!secret) {
      log.info(`Secret with name ${args.secret} not found.`)
      return { result: {} }
    }

    log.info(secret)

    return { result: { name: args.secret, value: secret } }
  }
}
