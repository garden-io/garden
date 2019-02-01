/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  Command,
  CommandParams,
  CommandResult,
} from "./base"
import { logHeader } from "../logger/util"
import dedent = require("dedent")

export class ValidateCommand extends Command {
  name = "validate"
  help = "Check your garden configuration for errors."

  description = dedent`
    Throws an error and exits with code 1 if something's not right in your garden.yml files.
  `

  async action({ garden, log }: CommandParams): Promise<CommandResult> {
    logHeader({ log, emoji: "heavy_check_mark", command: "validate" })

    const graph = await garden.getConfigGraph()
    await graph.getModules()

    return {}
  }
}
