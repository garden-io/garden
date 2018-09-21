/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  BooleanParameter,
  Command,
  CommandResult,
  CommandParams,
} from "./base"
import { logHeader } from "../logger/util"
import dedent = require("dedent")

const initOpts = {
  force: new BooleanParameter({ help: "Force initalization of environment, ignoring the environment status check." }),
}

type Opts = typeof initOpts

export class InitCommand extends Command {
  name = "init"
  help = "Initialize system, environment or other runtime components."

  description = dedent`
    This command needs to be run before first deploying a Garden project, and occasionally after updating Garden,
    plugins or project configuration.

    Examples:

        garden init
        garden init --force   # runs the init flows even if status checks report that the environment is ready
  `

  options = initOpts

  async action({ garden, log, opts }: CommandParams<{}, Opts>): Promise<CommandResult<{}>> {
    const { name } = garden.environment
    logHeader({ log, emoji: "gear", command: `Initializing ${name} environment` })

    await garden.actions.prepareEnvironment({ log, force: opts.force, allowUserInput: true })

    log.info("")
    logHeader({ log, emoji: "heavy_check_mark", command: `Done!` })

    return { result: {} }
  }
}
