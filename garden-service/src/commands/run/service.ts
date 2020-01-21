/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { RunResult } from "../../types/plugin/base"
import { BooleanParameter, Command, CommandParams, CommandResult, StringParameter } from "../base"
import { printRuntimeContext } from "./run"
import dedent = require("dedent")
import { printHeader } from "../../logger/util"
import { DeployTask } from "../../tasks/deploy"
import { getServiceStatuses, getRunTaskResults } from "../../tasks/base"
import { prepareRuntimeContext } from "../../runtime-context"
import { deline } from "../../util/string"
import { CommandError } from "../../exceptions"

const runArgs = {
  service: new StringParameter({
    help: "The service to run.",
    required: true,
  }),
}

const runOpts = {
  "force": new BooleanParameter({
    help: "Run the service even if it's disabled for the environment.",
  }),
  "force-build": new BooleanParameter({
    help: "Force rebuild of module.",
  }),
}

type Args = typeof runArgs
type Opts = typeof runOpts

export class RunServiceCommand extends Command<Args, Opts> {
  name = "service"
  help = "Run an ad-hoc instance of the specified service."

  // Makes no sense to run a service (which is expected to stay running) except when attaching in the CLI
  cliOnly = true

  description = dedent`
    This can be useful for debugging or ad-hoc experimentation with services.

    Examples:

        garden run service my-service   # run an ad-hoc instance of a my-service and attach to it
  `

  arguments = runArgs
  options = runOpts

  async action({ garden, log, headerLog, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<RunResult>> {
    const serviceName = args.service
    const graph = await garden.getConfigGraph(log)
    const service = await graph.getService(serviceName, true)
    const module = service.module

    if (service.disabled && !opts.force) {
      throw new CommandError(
        chalk.red(deline`
          Service ${chalk.redBright(service.name)} is disabled for the ${chalk.redBright(garden.environmentName)}
          environment. If you're sure you want to run it anyway, please run the command again with the
          ${chalk.redBright("--force")} flag.
        `),
        { serviceName: service.name, environmentName: garden.environmentName }
      )
    }

    printHeader(headerLog, `Running service ${chalk.cyan(serviceName)} in module ${chalk.cyan(module.name)}`, "runner")

    const actions = await garden.getActionRouter()

    // Make sure all dependencies are ready and collect their outputs for the runtime context
    const deployTask = new DeployTask({
      force: true,
      forceBuild: opts["force-build"],
      garden,
      graph,
      log,
      service,
    })
    const dependencyResults = await garden.processTasks(await deployTask.getDependencies())

    const dependencies = await graph.getDependencies({ nodeType: "deploy", name: serviceName, recursive: false })
    const serviceStatuses = getServiceStatuses(dependencyResults)
    const taskResults = getRunTaskResults(dependencyResults)

    const runtimeContext = await prepareRuntimeContext({
      garden,
      graph,
      dependencies,
      module,
      serviceStatuses,
      taskResults,
    })

    printRuntimeContext(log, runtimeContext)

    const result = await actions.runService({
      log,
      service,
      runtimeContext,
      interactive: true,
      timeout: 999999,
    })

    return { result }
  }
}
