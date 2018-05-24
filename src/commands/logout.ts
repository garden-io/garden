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
} from "./base"
import { EntryStyle } from "../logger/types"
import { PluginContext } from "../plugin-context"
import { LoginStatusMap } from "../types/plugin/outputs"

export class LogoutCommand extends Command {
  name = "logout"
  help = "Log into the Garden framework"

  async action(ctx: PluginContext): Promise<CommandResult<LoginStatusMap>> {

    ctx.log.header({ emoji: "lock", command: "Logout" })

    const entry = ctx.log.info({ msg: "Logging out...", entryStyle: EntryStyle.activity })

    const result = await ctx.logout({})

    entry.setSuccess("Logged out successfully")

    return { result }
  }
}
