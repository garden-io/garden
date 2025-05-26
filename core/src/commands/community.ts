/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CommandResult } from "./base.js"
import { Command } from "./base.js"
import dedent from "dedent"
import { exec } from "../util/util.js"

export class CommunityCommand extends Command {
  name = "community"
  help = "Join our community Discord to chat with us!"

  override description = dedent`
    Opens the Garden Community Discord invite link
  `

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
