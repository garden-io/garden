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
import { EntryStyle } from "../logger/types"
import { LoginStatusMap } from "../types/plugin/outputs"
import dedent = require("dedent")

export class LogoutCommand extends Command {
  name = "logout"
  help = "Log out of configured providers for this project and environment."

  description = dedent`
    Examples:

         garden logout
  `

  async action({ garden }: CommandParams): Promise<CommandResult<LoginStatusMap>> {
    garden.log.header({ emoji: "lock", command: "Logout" })

    const entry = garden.log.info({ msg: "Logging out...", entryStyle: EntryStyle.activity })

    const result = await garden.actions.logout({})

    entry.setSuccess("Logged out successfully")

    return { result }
  }
}
