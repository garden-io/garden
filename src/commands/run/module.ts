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
import { RunResult } from "../../types/plugin"
import { BooleanParameter, Command, ParameterValues, StringParameter } from "../base"
import {
  uniq,
  values,
  flatten,
} from "lodash"
import { printRuntimeContext } from "./index"

export const runArgs = {
  module: new StringParameter({
    help: "The name of the module to run",
    required: true,
  }),
  // TODO: make this a variadic arg
  command: new StringParameter({
    help: "The command to run in the module",
  }),
}

export const runOpts = {
  // TODO: we could provide specific parameters like this by adding commands for specific modules, via plugins
  //entrypoint: new StringParameter({ help: "Override default entrypoint in module" }),
  interactive: new BooleanParameter({
    help: "Set to false to skip interactive mode and just output the command result",
    defaultValue: true,
  }),
  "force-build": new BooleanParameter({ help: "Force rebuild of module" }),
}

export type Args = ParameterValues<typeof runArgs>
export type Opts = ParameterValues<typeof runOpts>

export class RunModuleCommand extends Command<typeof runArgs, typeof runOpts> {
  name = "module"
  alias = "m"
  help = "Run the specified module"

  arguments = runArgs
  options = runOpts

  async action(ctx: PluginContext, args: Args, opts: Opts): Promise<RunResult> {
    const name = args.module
    const module = await ctx.getModule(name)

    const msg = args.command
      ? `Running command ${chalk.white(args.command)} in module ${chalk.white(name)}`
      : `Running module ${chalk.white(name)}`

    ctx.log.header({
      emoji: "runner",
      command: msg,
    })

    await ctx.configureEnvironment()

    const buildTask = new BuildTask(ctx, module, opts["force-build"])
    await ctx.addTask(buildTask)
    await ctx.processTasks()

    const command = args.command ? args.command.split(" ") : []

    // combine all dependencies for all services in the module, to be sure we have all the context we need
    const services = values(await module.getServices())
    const depNames = uniq(flatten(services.map(s => s.config.dependencies)))
    const deps = values(await ctx.getServices(depNames))

    const runtimeContext = await module.prepareRuntimeContext(deps)

    printRuntimeContext(ctx, runtimeContext)

    return ctx.runModule({ module, command, runtimeContext, silent: false, interactive: opts.interactive })
  }
}
