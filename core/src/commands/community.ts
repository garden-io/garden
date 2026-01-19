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
  help = "Checkout Garden Discussions on GitHub to chat with us!"

  override description = dedent`
    Opens the Garden Discussions page.
  `

  override noProject = true

  override printHeader() {}

  async action(): Promise<CommandResult> {
    const discussionsLink = "https://github.com/garden-io/garden/discussions"
    // eslint-disable-next-line no-console
    console.log(discussionsLink)

    try {
      await exec("open", [discussionsLink])
    } catch (_) {}

    return { result: { discussionsLink } }
  }
}
