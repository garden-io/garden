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
import { login } from "../platform/auth"

export class LoginCommand extends Command {
  name = "login"
  help = "Log in to Garden Cloud."
  hidden = true
  noProject = true

  description = dedent`
    Logs you in to Garden Cloud. Subsequent commands will have access to platform features.
  `

  async action({ garden, log, headerLog }: CommandParams): Promise<CommandResult> {
    printHeader(headerLog, "Login", "cloud")

    if (garden.platformUrl) {
      await login(garden.platformUrl, log)
    }

    return {}
  }
}
