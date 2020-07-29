/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, CommandParams, CommandResult } from "./base"
import { printHeader } from "../logger/util"
import dedent = require("dedent")
import { login } from "../enterprise/auth"
import { ConfigurationError } from "../exceptions"

export class LoginCommand extends Command {
  name = "login"
  help = "Log in to Garden Enterprise."
  hidden = true

  description = dedent`
    Logs you in to Garden Enterprise. Subsequent commands will have access to enterprise features.
  `

  async action({ garden, log, headerLog }: CommandParams): Promise<CommandResult> {
    printHeader(headerLog, "Login", "cloud")
    const enterpriseDomain = garden.enterpriseContext?.enterpriseDomain
    if (!enterpriseDomain) {
      throw new ConfigurationError(`Error: Your project configuration does not specify a domain.`, {})
    }
    await login(enterpriseDomain, log)
    return {}
  }
}
