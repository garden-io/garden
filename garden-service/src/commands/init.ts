/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BooleanParameter, Command, CommandResult, CommandParams } from "./base"
import { printHeader, printFooter } from "../logger/util"
import dedent = require("dedent")

const initOpts = {
  force: new BooleanParameter({
    help: "Force initalization of environment, ignoring the environment status check.",
  }),
}

type Opts = typeof initOpts

export class InitCommand extends Command {
  name = "init"
  help = "Initialize system, environment or other runtime components."

  // This command is generally only used when user input is needed, which will need to happen via the CLI
  cliOnly = true

  description = dedent`
    This command needs to be run before first deploying a Garden project, and occasionally after updating Garden,
    plugins or project configuration.

    Examples:

        garden init
        garden init --force   # runs the init flows even if status checks report that the environment is ready
  `

  options = initOpts

  async action({ garden, footerLog, headerLog, opts }: CommandParams<{}, Opts>): Promise<CommandResult<{}>> {
    const name = garden.environmentName
    printHeader(headerLog, `Initializing ${name} environment`, "gear")

    await garden.resolveProviders(opts.force)

    printFooter(footerLog)

    return { result: {} }
  }
}
