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
import { prepareRuntimeContext } from "../../runtime-context"
import { DeployTask } from "../../tasks/deploy"
import { RunResult } from "../../plugin/base"
import { deline } from "../../util/string"
import { Command, CommandParams, CommandResult, handleRunResult, ProcessResultMetadata } from "../base"
import { printRuntimeContext } from "./run"
import { GraphResults } from "../../graph/solver"
import { StringParameter, BooleanParameter } from "../../cli/params"

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

interface RunDeployOutput {
  result: RunResult & ProcessResultMetadata
  graphResults: GraphResults
}

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

    const actions = await garden.getActionRouter()

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

    const tasks = deployTask.resolveDependencies()
    const { results: dependencyResults } = await garden.processTasks({ tasks, log, throwOnError: true })
    const interactive = true

    const runtimeContext = await prepareRuntimeContext({
      action,
      graph,
      graphResults: dependencyResults,
    })

    printRuntimeContext(log, runtimeContext)

    if (interactive) {
      log.root.stop()
    }

    const result = await actions.deploy.run({
      log,
      graph,
      action,
      runtimeContext,
      interactive,
      timeout: 999999,
    })

    return handleRunResult({
      log,
      description: "run deploy",
      result,
      interactive,
      graphResults: dependencyResults,
      action,
    })
  }
}
