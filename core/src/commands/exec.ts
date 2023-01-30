/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { LoggerType } from "../logger/logger"
import { printHeader } from "../logger/util"
import { Command, CommandResult, CommandParams } from "./base"
import dedent = require("dedent")
import { StringParameter, BooleanParameter, ParameterValues } from "../cli/params"
import { ExecInDeployResult, execInDeployResultSchema } from "../plugin/handlers/Deploy/exec"
import { executeAction } from "../graph/actions"

const execArgs = {
  service: new StringParameter({
    help: "The service to exec the command in.",
    required: true,
  }),
  // TODO: make this variadic
  command: new StringParameter({
    help: "The command to run.",
    required: true,
  }),
}

const execOpts = {
  interactive: new BooleanParameter({
    help: "Set to false to skip interactive mode and just output the command result",
    defaultValue: false,
    // TODO-G2: consider changing this default, this is the only command with cliDefault: true.
    //  Remember to update test cases in cli/helpers.ts.
    cliDefault: true,
    cliOnly: true,
  }),
}

type Args = typeof execArgs
type Opts = typeof execOpts

export class ExecCommand extends Command<Args, Opts> {
  name = "exec"
  help = "Executes a command (such as an interactive shell) in a running service."

  description = dedent`
    Finds an active container for a deployed service and executes the given command within the container.
    Supports interactive shells.

    _NOTE: This command may not be supported for all module types._

    Examples:

         garden exec my-service /bin/sh   # runs a shell in the my-service container
  `

  arguments = execArgs
  options = execOpts

  outputsSchema = () => execInDeployResultSchema()

  getLoggerType(): LoggerType {
    return "basic"
  }

  printHeader({ headerLog, args }) {
    const serviceName = args.service
    const command = this.getCommand(args)
    printHeader(
      headerLog,
      `Running command ${chalk.cyan(command.join(" "))} in service ${chalk.cyan(serviceName)}`,
      "runner"
    )
  }

  async action({ garden, log, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<ExecInDeployResult>> {
    const serviceName = args.service
    const command = this.getCommand(args)

    const graph = await garden.getConfigGraph({ log, emit: false })
    const action = graph.getDeploy(serviceName)

    const executed = await executeAction({ garden, graph, action, log })

    const router = await garden.getActionRouter()
    const result = await router.deploy.exec({
      log,
      graph,
      action: executed,
      command,
      interactive: opts.interactive,
    })

    return { result }
  }

  private getCommand(args: ParameterValues<Args>) {
    return args.command.split(" ") || []
  }
}
