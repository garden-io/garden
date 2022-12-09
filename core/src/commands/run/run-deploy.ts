/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import dedent = require("dedent")

import { CommandError } from "../../exceptions"
import { printHeader } from "../../logger/util"
import { deline } from "../../util/string"
import { Command, CommandParams, CommandResult, ExecActionOutput, handleExecResult } from "../base"
import { StringParameter, BooleanParameter } from "../../cli/params"
import { DeployTask } from "../../tasks/deploy"

const runDeployArgs = {
  name: new StringParameter({
    help: "The deploy/service to run.",
    required: true,
  }),
}

const runDeployOpts = {
  "force": new BooleanParameter({
    help: "Run the action even if it's disabled for the environment.",
  }),
  "force-build": new BooleanParameter({
    help: "Force rebuild of any build dependencies.",
  }),
}

type Args = typeof runDeployArgs
type Opts = typeof runDeployOpts

type RunDeployOutput = ExecActionOutput

export class RunDeployCommand extends Command<Args, Opts> {
  name = "deploy"
  help = "Run an ad-hoc instance of the specified deploy/service."
  aliases = ["service"]

  // Makes no sense to run a deploy (which is expected to stay running) except when attaching in the CLI
  cliOnly = true

  description = dedent`
    This can be useful for debugging or ad-hoc experimentation with services.

    Examples:

        garden run deploy my-service   # run an ad-hoc instance of my-service and attach to it
  `

  arguments = runDeployArgs
  options = runDeployOpts

  printHeader({ headerLog, args }) {
    printHeader(headerLog, `Running service ${chalk.cyan(args.name)}`, "runner")
  }

  async action({ garden, log, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<RunDeployOutput>> {
    const serviceName = args.name
    const graph = await garden.getConfigGraph({ log, emit: false })
    const action = graph.getDeploy(serviceName, { includeDisabled: true })
    const interactive = true

    if (action.isDisabled() && !opts.force) {
      throw new CommandError(
        chalk.red(deline`
          ${action.longDescription()} is disabled for the ${chalk.redBright(garden.environmentName)}
          environment. If you're sure you want to run it anyway, please run the command again with the
          ${chalk.redBright("--force")} flag.
        `),
        { serviceName: action.name, environmentName: garden.environmentName }
      )
    }

    const router = await garden.getActionRouter()

    // Make sure all dependencies are ready and collect their outputs for the runtime context
    const deployTask = new DeployTask({
      force: true,
      forceBuild: opts["force-build"],
      garden,
      graph,
      log,
      action,
      fromWatch: false,
      devModeDeployNames: [],
      localModeDeployNames: [],
    })

    const dependencyTasks = deployTask.resolveProcessDependencies()
    const { results: dependencyResults } = await garden.processTasks({
      tasks: dependencyTasks,
      log,
      throwOnError: true,
    })

    if (interactive) {
      log.root.stop()
    }

    const resolved = await garden.resolveAction({ action, graph, log })

    const result = await router.deploy.run({
      log,
      graph,
      // action: executedAction,
      action: resolved,
      interactive,
      timeout: 999999,
    })

    return handleExecResult({
      log,
      description: "run deploy",
      result,
      interactive,
      graphResults: dependencyResults,
    })
  }
}
