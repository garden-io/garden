/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { LoggerType } from "../logger/logger"
import { ExecInServiceResult } from "../types/plugin/outputs"
import {
  Command,
  CommandResult,
  CommandParams,
  StringParameter,
  StringsParameter,
} from "./base"
import dedent = require("dedent")

const runArgs = {
  service: new StringParameter({
    help: "The service to exec the command in.",
    required: true,
  }),
  command: new StringsParameter({
    help: "The command to run.",
    required: true,
  }),
}

const runOpts = {
  // interactive: new BooleanParameter({
  //   help: "Set to false to skip interactive mode and just output the command result",
  //   defaultValue: true,
  // }),
}

type Args = typeof runArgs

export class ExecCommand extends Command<Args> {
  name = "exec"
  alias = "e"
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
  loggerType = LoggerType.basic

  async action({ garden, args }: CommandParams<Args>): Promise<CommandResult<ExecInServiceResult>> {
    const serviceName = args.service
    const command = args.command || []

    garden.log.header({
      emoji: "runner",
      command: `Running command ${chalk.cyan(command.join(" "))} in service ${chalk.cyan(serviceName)}`,
    })

    const service = await garden.getService(serviceName)
    const result = await garden.actions.execInService({ service, command })

    return { result }
  }
}
