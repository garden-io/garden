/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { PluginContext } from "../plugin-context"
import {
  ExecInServiceResult,
} from "../types/plugin/outputs"
import {
  Command,
  CommandResult,
  ParameterValues,
  StringParameter,
} from "./base"
import dedent = require("dedent")

export const runArgs = {
  service: new StringParameter({
    help: "The service to exec the command in.",
    required: true,
  }),
  command: new StringParameter({
    help: "The command to run.",
    required: true,
  }),
}

export const runOpts = {
  // interactive: new BooleanParameter({
  //   help: "Set to false to skip interactive mode and just output the command result",
  //   defaultValue: true,
  // }),
}

export type Args = ParameterValues<typeof runArgs>
// export type Opts = ParameterValues<typeof runOpts>

export class ExecCommand extends Command<typeof runArgs, typeof runOpts> {
  name = "exec"
  alias = "e"
  help = "Executes a command (such as an interactive shell) in a running service."

  description = dedent`
    Finds an active container for a deployed service and executes the given command within the container.
    Supports interactive shells.

    _NOTE: This command may not be supported for all module types.

    Examples:

         garden exec my-service /bin/sh   # runs a shell in the my-service container
  `

  arguments = runArgs
  options = runOpts

  async action(ctx: PluginContext, args: Args): Promise<CommandResult<ExecInServiceResult>> {
    const serviceName = args.service
    const command = args.command.split(" ")

    ctx.log.header({
      emoji: "runner",
      command: `Running command ${chalk.cyan(args.command)} in service ${chalk.cyan(serviceName)}`,
    })

    await ctx.configureEnvironment({})

    const result = await ctx.execInService({ serviceName, command })

    return { result }
  }
}
