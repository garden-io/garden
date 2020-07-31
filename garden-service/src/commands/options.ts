/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, CommandParams, CommandResult } from "./base"
import { renderOptions, cliStyles } from "../cli/helpers"
import { globalOptions } from "../cli/params"

export class OptionsCommand extends Command {
  name = "options"
  help = "Print global options."
  noProject = true

  description = "Prints all global options (options that can be applied to any command)."

  async action({ log }: CommandParams): Promise<CommandResult> {
    log.info("")
    log.info(cliStyles.heading("GLOBAL OPTIONS"))
    log.info(renderOptions(globalOptions))
    log.info("")

    return {}
  }
}
