/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { printHeader } from "../logger/util"
import { Command, CommandResult, CommandParams } from "./base"
import dedent = require("dedent")
import { StringParameter, BooleanParameter, ParameterValues, StringsParameter } from "../cli/params"
import { ExecInDeployResult, execInDeployResultSchema } from "../plugin/handlers/Deploy/exec"
import { resolveAction } from "../graph/actions"
import { NotFoundError } from "../exceptions"

const execArgs = {
  deploy: new StringParameter({
    help: "The service to exec the command in.",
    required: true,
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.actionConfigs.Deploy)
    },
  }),
  command: new StringsParameter({
    help: "The command to run.",
    required: true,
    spread: true,
  }),
}

const execOpts = {
  interactive: new BooleanParameter({
    help: "Set to false to skip interactive mode and just output the command result",
    defaultValue: false,
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

  printHeader({ headerLog, args }) {
    const serviceName = args.deploy
    const command = this.getCommand(args)
    printHeader(
      headerLog,
      `Running command ${chalk.cyan(command.join(" "))} in service ${chalk.cyan(serviceName)}`,
      "runner"
    )
  }

  async action({ garden, log, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<ExecInDeployResult>> {
    const serviceName = args.deploy
    const command = this.getCommand(args)

    const graph = await garden.getConfigGraph({ log, emit: false })
    const action = graph.getDeploy(serviceName)

    const resolved = await resolveAction({ garden, graph, action, log })

    // Just get the status, don't actually deploy
    const router = await garden.getActionRouter()
    const status = await router.deploy.getStatus({ action: resolved, graph, log })
    const deployState = status.result.detail?.state
    switch (deployState) {
      // Warn if the deployment is not ready yet or unhealthy, but still proceed.
      case undefined:
      case "deploying":
      case "outdated":
      case "unhealthy":
      case "unknown":
        log.warn(chalk.white(`Current state: ${chalk.whiteBright(deployState)}`))
        break
      // Only fail if the deployment is missing or stopped.
      case "missing":
      case "stopped":
        throw new NotFoundError(
          `Cannot execute command in the '${action.name}' service. The target container is ${deployState}.`,
          { deployState }
        )
      case "ready":
        // Nothing to report/throw, the deployment is ready
        break
      default:
        // To make sure this switch statement is not forgotten if the `DeployState` FSM gets modified.
        const _exhaustiveCheck: never = deployState
        return _exhaustiveCheck
    }

    const { result } = await router.deploy.exec({
      log,
      graph,
      action: resolved,
      command,
      interactive: opts.interactive,
    })

    return { result }
  }

  private getCommand(args: ParameterValues<Args>) {
    return args.command || []
  }
}
