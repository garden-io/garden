/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { LoggerType } from "../logger/logger"
import { ExecInServiceResult } from "../types/plugin/service/execInService"
import { printHeader } from "../logger/util"
import { Command, CommandResult, CommandParams, StringParameter, BooleanParameter, StringsParameter } from "./base"
import dedent = require("dedent")

const runArgs = {
  service: new StringParameter({
    help: "The service to exec the command in.",
    required: true,
  }),
  command: new StringsParameter({
    help: "The command to run.",
    required: true,
    delimiter: " ",
  }),
}

const runOpts = {
  interactive: new BooleanParameter({
    help: "Set to false to skip interactive mode and just output the command result",
    defaultValue: false,
    cliDefault: true,
    cliOnly: true,
  }),
}

type Args = typeof runArgs
type Opts = typeof runOpts

export class ExecCommand extends Command<Args> {
  name = "exec"
  help = "Executes a command (such as an interactive shell) in a running service."

  description = dedent`
    Finds an active container for a deployed service and executes the given command within the container.
    Supports interactive shells.

    _NOTE: This command may not be supported for all module types._

    Examples:

         garden exec my-service /bin/sh   # runs a shell in the my-service container
  `

  arguments = runArgs
  options = runOpts
  loggerType: LoggerType = "basic"

  async action({
    garden,
    log,
    headerLog,
    args,
    opts,
  }: CommandParams<Args, Opts>): Promise<CommandResult<ExecInServiceResult>> {
    const serviceName = args.service
    const command = args.command || []

    printHeader(
      headerLog,
      `Running command ${chalk.cyan(command.join(" "))} in service ${chalk.cyan(serviceName)}`,
      "runner"
    )

    const graph = await garden.getConfigGraph(log)
    const service = await graph.getService(serviceName)
    const actions = await garden.getActionRouter()
    const result = await actions.execInService({
      log,
      service,
      command,
      interactive: opts.interactive,
    })

    return { result }
  }
}
