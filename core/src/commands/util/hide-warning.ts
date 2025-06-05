/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CommandParams } from "../base.js"
import { Command } from "../base.js"
import dedent from "dedent"
import { StringParameter } from "../../cli/params.js"

const hideWarningArgs = {
  key: new StringParameter({
    help: "The key of the warning to hide (this will be shown along with relevant warning messages).",
    required: true,
  }),
}

type Args = typeof hideWarningArgs

export class HideWarningCommand extends Command<Args, {}> {
  name = "hide-warning"
  help = "Hide a specific warning message."
  override cliOnly = true

  override noProject = true

  override description = dedent`
    Hides the specified warning message. The command and key is generally provided along with displayed warning messages.
  `

  override arguments = hideWarningArgs

  override printHeader() {}

  async action({ garden, args }: CommandParams<Args, {}>) {
    await garden.hideWarning(args.key)
    return {}
  }
}
