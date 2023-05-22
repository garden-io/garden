/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { Command, CommandParams, CommandResult } from "./base"
import { dedent } from "../util/string"
import { deployArgs, DeployCommand, deployOpts } from "./deploy"
import { serveOpts } from "./serve"
import { DevCommand } from "./dev"
import type { LoggerType } from "../logger/logger"

const upArgs = {
  ...deployArgs,
}

const upOpts = {
  ...deployOpts,
  ...serveOpts,
}

type UpArgs = typeof upArgs
type UpOpts = typeof upOpts

export class UpCommand extends Command<UpArgs, UpOpts> {
  name = "up"
  help = "Spin up your stack with the dev console and streaming logs."
  emoji: "🚀"

  description = dedent`
    Spin up your stack with the dev console and streaming logs.

    This is basically an alias for ${chalk.cyanBright(
      "garden dev --cmd 'deploy --logs'"
    )}, but you can add any arguments and flags supported by the ${chalk.cyanBright("deploy")} command as well.
  `

  getTerminalWriterType(): LoggerType {
    return "ink"
  }

  async action(params: CommandParams<UpArgs, UpOpts>): Promise<CommandResult> {
    let cmd: Command = new DevCommand()

    if (params.commandLine) {
      // We're already in the dev command
      cmd = new DeployCommand()
      params.opts.logs = true
    } else {
      params.opts.cmd = ["deploy --logs " + params.args.$all!.join(" ")]
    }

    cmd.printHeader(params)
    await cmd.prepare(params)

    return cmd.action(params)
  }
}
