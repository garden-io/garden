/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, CommandResult } from "./base"
import dedent = require("dedent")
import { exec } from "../util/util"

export class CommunityCommand extends Command {
  name = "community"
  help = "Join our community Discord to chat with us!"

  override description = dedent`
    Opens the Garden Community Discord invite link
  `

  loggerType: "basic"

  override noProject = true

  override printHeader() {}

  async action(): Promise<CommandResult> {
    const discordInvite = "https://discord.gg/FrmhuUjFs6"
    // eslint-disable-next-line no-console
    console.log(discordInvite)

    try {
      await exec("open", [discordInvite])
    } catch (_) {}

    return { result: { discordInvite } }
  }
}
