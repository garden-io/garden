/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  Command,
  CommandResult,
  CommandParams,
} from "./base"
import { LoginStatusMap } from "../types/plugin/outputs"
import dedent = require("dedent")

export class LogoutCommand extends Command {
  name = "logout"
  help = "Log out of configured providers for this project and environment."

  description = dedent`
    Examples:

         garden logout
  `

  async action({ ctx }: CommandParams): Promise<CommandResult<LoginStatusMap>> {

    ctx.log.header({ emoji: "lock", command: "Logout" })

    const entry = ctx.log.info({ msg: "Logging out...", status: "active" })

    const result = await ctx.logout({})

    entry.setSuccess("Logged out successfully")

    return { result }
  }
}
