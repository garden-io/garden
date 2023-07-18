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
import dedent from "dedent"
import { StringParameter, BooleanParameter, ParameterValues, StringsParameter } from "../cli/params"
import { ExecInDeployResult, execInDeployResultSchema } from "../plugin/handlers/Deploy/exec"
import { executeAction } from "../graph/actions"
import { NotFoundError } from "../exceptions"
import { DeployStatus } from "../plugin/handlers/Deploy/get-status"
import { createActionLog } from "../logger/log-entry"

const execArgs = {
  deploy: new StringParameter({
    help: "The running Deploy action to exec the command in.",
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
    aliases: ["i"],
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

  override description = dedent`
    Finds an active container for a deployed Deploy and executes the given command within the container.
    Supports interactive shells.

    _NOTE: This command may not be supported for all action types._

    Examples:

         garden exec my-service /bin/sh   # runs a shell in the my-service Deploy's container
  `

  override arguments = execArgs
  override options = execOpts

  override outputsSchema = () => execInDeployResultSchema()

  override printHeader({ log, args }) {
    const deployName = args.deploy
    const command = this.getCommand(args)
    printHeader(log, `Running command ${chalk.cyan(command.join(" "))} in Deploy ${chalk.cyan(deployName)}`, "runner")
  }

  async action({ garden, log, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<ExecInDeployResult>> {
    const deployName = args.deploy
    const command = this.getCommand(args)

    const graph = await garden.getConfigGraph({ log, emit: false })
    const action = graph.getDeploy(deployName)

    // Just get the status, don't actually deploy
    const executed = await executeAction({ garden, graph, action, log, statusOnly: true })
    const status: DeployStatus = executed.getStatus()
    const deployState = status.detail?.state

    const router = await garden.getActionRouter()
    const actionLog = createActionLog({ log, actionName: action.name, actionKind: action.kind })

    switch (deployState) {
      // Warn if the deployment is not ready yet or unhealthy, but still proceed.
      case undefined:
      case "deploying":
      case "unhealthy":
      case "unknown":
        log.warn(
          `The current state of ${action.key()} is ${chalk.whiteBright(
            deployState
          )}. If this command fails, you may need to re-deploy it with the ${chalk.whiteBright("deploy")} command.`
        )
        break
      case "outdated":
        // check if deployment is in sync mode
        const syncStatus = (
          await router.deploy.getSyncStatus({
            log: actionLog,
            action: executed,
            monitor: false,
            graph,
          })
        ).result
        const deploySync = syncStatus?.syncs?.[0]
        // if there is an active sync, the state is likely to be outdated so do not display this warning
        if (!(deploySync?.syncCount && deploySync?.syncCount > 0 && deploySync?.state === "active")) {
          log.warn(
            `The current state of ${action.key()} is ${chalk.whiteBright(
              deployState
            )}. If this command fails, you may need to re-deploy it with the ${chalk.whiteBright("deploy")} command.`
          )
        }
        break
      // Only fail if the deployment is missing or stopped.
      case "missing":
      case "stopped":
        throw new NotFoundError({
          message: `${action.key()} status is ${deployState}. Cannot execute command.`,
          detail: { deployState },
        })
      case "ready":
        // Nothing to report/throw, the deployment is ready
        break
      default:
        // To make sure this switch statement is not forgotten if the `DeployState` FSM gets modified.
        return deployState satisfies never
    }

    const { result } = await router.deploy.exec({
      log: actionLog,
      graph,
      action: executed,
      command,
      interactive: opts.interactive,
    })

    return { result }
  }

  private getCommand(args: ParameterValues<Args>) {
    return args.command || []
  }
}
