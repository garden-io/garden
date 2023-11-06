/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import type { CommandParams, CommandResult } from "./base.js"
import { Command } from "./base.js"
import { dedent } from "../util/string.js"
import type { deployArgs, deployOpts } from "./deploy.js"
import type { serveOpts } from "./serve.js"
import type { LoggerType } from "../logger/logger.js"

type UpArgs = typeof deployArgs
type UpOpts = typeof deployOpts & typeof serveOpts

export class UpCommand extends Command<UpArgs, UpOpts> {
  name = "up"
  help = "Spin up your stack with the dev console and streaming logs."
  emoji = "🚀"

  override description = dedent`
    Spin up your stack with the dev console and streaming logs.

    This is basically an alias for ${chalk.cyanBright(
      "garden dev --cmd 'deploy --logs'"
    )}, but you can add any arguments and flags supported by the ${chalk.cyanBright("deploy")} command as well.
  `

  override getTerminalWriterType(): LoggerType {
    return "ink"
  }

  async action(params: CommandParams<UpArgs, UpOpts>): Promise<CommandResult> {
    const { DeployCommand } = await import("./deploy.js")
    if (!params.commandLine) {
      // import here to avoid a circular dependency
      const { runAsDevCommand } = await import("./helpers.js")

      // Then we start a dev command and run `deploy --logs` as the first interactive command.
      return runAsDevCommand("deploy --logs", params)
    }

    params.opts.logs = true
    // Else, we're already in the dev command.
    const cmd = new DeployCommand()

    cmd.printHeader(params)
    await cmd.prepare(params)

    return cmd.action(params)
  }
}
