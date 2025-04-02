/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CommandParams, CommandResult } from "./base.js"
import { Command } from "./base.js"
import { renderOptions, cliStyles } from "../cli/helpers.js"
import { globalOptions } from "../cli/params.js"

export class OptionsCommand extends Command {
  name = "options"
  help = "Print global options."
  override noProject = true

  override description = "Prints all global options (options that can be applied to any command)."

  override printHeader() {}

  async action({ log }: CommandParams): Promise<CommandResult> {
    log.info("")
    log.info(cliStyles.heading("GLOBAL OPTIONS"))
    log.info(renderOptions(globalOptions))
    log.info("")

    return {}
  }
}
