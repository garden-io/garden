/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, CommandParams } from "../base"
import dedent from "dedent"
import { StringParameter } from "../../cli/params"
import { Warning } from "../../db/entities/warning"

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
  cliOnly = true

  noProject = true

  description = dedent`
    Hides the specified warning message. The command and key is generally provided along with displayed warning messages.
  `

  arguments = hideWarningArgs

  async action({ args }: CommandParams<Args, {}>) {
    await Warning.hide(args.key)

    return {}
  }
}
