/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { printHeader } from "../logger/util.js"
import type { CommandResult, CommandParams } from "./base.js"
import { Command } from "./base.js"
import dedent from "dedent"
import type { ParameterValues } from "../cli/params.js"
import { StringParameter, BooleanParameter } from "../cli/params.js"
import type { ExecInDeployResult } from "../plugin/handlers/Deploy/exec.js"
import { execInDeployResultSchema } from "../plugin/handlers/Deploy/exec.js"
import { executeAction } from "../graph/actions.js"
import { CommandError, NotFoundError } from "../exceptions.js"
import type { DeployStatus } from "../plugin/handlers/Deploy/get-status.js"
import { createActionLog } from "../logger/log-entry.js"
import { K8_POD_DEFAULT_CONTAINER_ANNOTATION_KEY } from "../plugins/kubernetes/run.js"
import { styles } from "../logger/styles.js"

const execArgs = {
  deploy: new StringParameter({
    help: "The running Deploy action to exec the command in.",
    required: true,
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.actionConfigs.Deploy)
    },
  }),
  command: new StringParameter({
    help: "The use of the positional command argument is deprecated. Use  `--` followed by your command instead.",
    required: false,
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
  target: new StringParameter({
    help: `Specify name of the target if a Deploy action consists of multiple components. _NOTE: This option is only relevant in certain scenarios and will be ignored otherwise._ For Kubernetes deploy actions, this is useful if a Deployment includes multiple containers, such as sidecar containers. By default, the container with \`${K8_POD_DEFAULT_CONTAINER_ANNOTATION_KEY}\` annotation or the first container is picked.`,
    cliOnly: true,
    defaultValue: undefined,
    required: false,
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
    You can specify the command to run as a parameter, or pass it after a \`--\` separator. For commands
    with arguments or quoted substrings, use the \`--\` separator.

    _NOTE: This command may not be supported for all action types. The use of the positional command argument
    is deprecated. Use  \`--\` followed by your command instead._

    Examples:

         garden exec my-service /bin/sh   # runs an interactive shell in the my-service Deploy's container
         garden exec my-service -- /bin/sh -c echo "hello world" # prints "hello world" in the my-service Deploy's container and exits
  `

  override arguments = execArgs
  override options = execOpts

  override outputsSchema = () => execInDeployResultSchema()

  override printHeader({ log, args }) {
    const deployName = args.deploy
    const command = this.getCommand(args)
    printHeader(
      log,
      `Running command ${styles.highlight(command.join(" "))} in Deploy ${styles.highlight(deployName)}`,
      "runner"
    )
  }

  async action({ garden, log, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<ExecInDeployResult>> {
    const deployName = args.deploy
    const command = this.getCommand(args)

    if (!command.length) {
      throw new CommandError({ message: `No command specified. Nothing to execute.` })
    }

    const target = opts["target"] as string | undefined

    const graph = await garden.getConfigGraph({ log, emit: false })
    const action = graph.getDeploy(deployName)

    // Just get the status, don't actually deploy
    const executed = await executeAction({ garden, graph, action, log, statusOnly: true })
    const status: DeployStatus = executed.getStatus()
    const deployState = status.detail?.state

    const router = await garden.getActionRouter()
    const actionLog = createActionLog({ log, action })

    switch (deployState) {
      // Warn if the deployment is not ready yet or unhealthy, but still proceed.
      case undefined:
      case "deploying":
      case "unhealthy":
      case "unknown":
        log.warn(
          `The current state of ${action.key()} is ${styles.highlight(
            deployState || "unknown"
          )}. If this command fails, you may need to re-deploy it with the ${styles.command("deploy")} command.`
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
            `The current state of ${action.key()} is ${styles.highlight(
              deployState
            )}. If this command fails, you may need to re-deploy it with the ${styles.command("deploy")} command.`
          )
        }
        break
      // Only fail if the deployment is missing or stopped.
      case "missing":
      case "stopped":
        throw new NotFoundError({
          message: `${action.key()} status is ${deployState}. Cannot execute command.`,
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
      target,
      interactive: opts.interactive,
    })

    return { result }
  }

  private getCommand(args: ParameterValues<Args>) {
    return args.command ? args.command.split(" ") : args["--"] || []
  }
}
