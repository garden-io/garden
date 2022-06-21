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
import { getRunTaskResults, getServiceStatuses } from "../../tasks/base"
import { DeployTask } from "../../tasks/deploy"
import { RunResult } from "../../types/plugin/base"
import { deline } from "../../util/string"
import { Command, CommandParams, CommandResult, handleRunResult, ProcessResultMetadata } from "../base"
import { printRuntimeContext } from "./run"
import { GraphResults } from "../../task-graph"
import { StringParameter, BooleanParameter } from "../../cli/params"

const runServiceArgs = {
  service: new StringParameter({
    help: "The service to run.",
    required: true,
  }),
}

const runServiceOpts = {
  "force": new BooleanParameter({
    help: "Run the service even if it's disabled for the environment.",
  }),
  "force-build": new BooleanParameter({
    help: "Force rebuild of module.",
  }),
}

type Args = typeof runServiceArgs
type Opts = typeof runServiceOpts

interface RunServiceOutput {
  result: RunResult & ProcessResultMetadata
  graphResults: GraphResults
}

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

  arguments = runServiceArgs
  options = runServiceOpts

  printHeader({ headerLog, args }) {
    const serviceName = args.service
    printHeader(headerLog, `Running service ${chalk.cyan(serviceName)}`, "runner")
  }

  async action({ garden, log, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<RunServiceOutput>> {
    const serviceName = args.service
    const graph = await garden.getConfigGraph({ log, emit: false })
    const service = graph.getService(serviceName, true)

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

    const actions = await garden.getActionRouter()

    // Make sure all dependencies are ready and collect their outputs for the runtime context
    const deployTask = new DeployTask({
      force: true,
      forceBuild: opts["force-build"],
      garden,
      graph,
      log,
      service,
      devModeServiceNames: [],
      hotReloadServiceNames: [],
      localModeServiceNames: [],
    })
    const dependencyResults = await garden.processTasks(await deployTask.resolveDependencies())

    const dependencies = graph.getDependencies({ nodeType: "deploy", name: serviceName, recursive: false })
    const serviceStatuses = getServiceStatuses(dependencyResults)
    const taskResults = getRunTaskResults(dependencyResults)
    const interactive = true

    const runtimeContext = await prepareRuntimeContext({
      garden,
      graph,
      dependencies,
      version: service.version,
      moduleVersion: service.module.version.versionString,
      serviceStatuses,
      taskResults,
    })

    printRuntimeContext(log, runtimeContext)

    if (interactive) {
      log.root.stop()
    }

    const result = await actions.runService({
      log,
      graph,
      service,
      runtimeContext,
      interactive,
      timeout: 999999,
    })

    return handleRunResult({
      log,
      actionDescription: "run service",
      result,
      interactive,
      graphResults: dependencyResults,
    })
  }
}
