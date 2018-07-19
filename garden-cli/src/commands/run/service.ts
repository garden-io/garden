/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { PluginContext } from "../../plugin-context"
import { BuildTask } from "../../tasks/build"
import { RunResult } from "../../types/plugin/outputs"
import {
  BooleanParameter,
  Command,
  CommandResult,
  ParameterValues,
  StringParameter,
} from "../base"
import { printRuntimeContext } from "./run"
import dedent = require("dedent")

export const runArgs = {
  service: new StringParameter({
    help: "The service to run",
    required: true,
  }),
}

export const runOpts = {
  "force-build": new BooleanParameter({ help: "Force rebuild of module" }),
}

export type Args = ParameterValues<typeof runArgs>
export type Opts = ParameterValues<typeof runOpts>

export class RunServiceCommand extends Command<typeof runArgs, typeof runOpts> {
  name = "service"
  alias = "s"
  help = "Run an ad-hoc instance of the specified service"

  description = dedent`
    This can be useful for debugging or ad-hoc experimentation with services.

    Examples:

        garden run service my-service   # run an ad-hoc instance of a my-service and attach to it
  `

  arguments = runArgs
  options = runOpts

  async action(ctx: PluginContext, args: Args, opts: Opts): Promise<CommandResult<RunResult>> {
    const serviceName = args.service
    const service = await ctx.getService(serviceName)
    const module = service.module

    ctx.log.header({
      emoji: "runner",
      command: `Running service ${chalk.cyan(serviceName)} in module ${chalk.cyan(module.name)}`,
    })

    await ctx.configureEnvironment({})

    const buildTask = await BuildTask.factory({ ctx, module, force: opts["force-build"] })
    await ctx.addTask(buildTask)
    await ctx.processTasks()

    const dependencies = await service.getDependencies()
    const runtimeContext = await module.prepareRuntimeContext(dependencies)

    printRuntimeContext(ctx, runtimeContext)

    const result = await ctx.runService({ serviceName, runtimeContext, silent: false, interactive: true })

    return { result }
  }
}
