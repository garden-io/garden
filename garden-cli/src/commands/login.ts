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

export class LoginCommand extends Command {
  name = "login"
  help = "Log into configured providers for this project and environment."

  description = dedent`
    Executes the login flow for any provider that requires login (such as the \`kubernetes\` provider).

    Examples:

         garden login
  `

  async action({ garden }: CommandParams): Promise<CommandResult<LoginStatusMap>> {
    garden.log.header({ emoji: "unlock", command: "Login" })
    garden.log.info({ msg: "Logging in...", entryStyle: EntryStyle.activity })

    const result = await garden.actions.login({})

    garden.log.info("\nLogin success!")

    return { result }
  }
}
