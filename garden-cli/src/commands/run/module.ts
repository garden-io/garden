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
  ParameterValues,
  StringParameter,
  CommandResult,
} from "../base"
import {
  uniq,
  flatten,
} from "lodash"
import { printRuntimeContext } from "./run"
import dedent = require("dedent")

export const runArgs = {
  module: new StringParameter({
    help: "The name of the module to run.",
    required: true,
  }),
  // TODO: make this a variadic arg
  command: new StringParameter({
    help: "The command to run in the module.",
  }),
}

export const runOpts = {
  // TODO: we could provide specific parameters like this by adding commands for specific modules, via plugins
  //entrypoint: new StringParameter({ help: "Override default entrypoint in module" }),
  interactive: new BooleanParameter({
    help: "Set to false to skip interactive mode and just output the command result.",
    defaultValue: true,
  }),
  "force-build": new BooleanParameter({ help: "Force rebuild of module before running." }),
}

export type Args = ParameterValues<typeof runArgs>
export type Opts = ParameterValues<typeof runOpts>

export class RunModuleCommand extends Command<typeof runArgs, typeof runOpts> {
  name = "module"
  alias = "m"
  help = "Run an ad-hoc instance of a module."

  description = dedent`
    This is useful for debugging or ad-hoc experimentation with modules.

    Examples:

        garden run module my-container           # run an ad-hoc instance of a my-container container and attach to it
        garden run module my-container /bin/sh   # run an interactive shell in a new my-container container
        garden run module my-container --i=false /some/script  # execute a script in my-container and return the output
  `

  arguments = runArgs
  options = runOpts

  async action(ctx: PluginContext, args: Args, opts: Opts): Promise<CommandResult<RunResult>> {
    const moduleName = args.module
    const module = await ctx.getModule(moduleName)

    const msg = args.command
      ? `Running command ${chalk.white(args.command)} in module ${chalk.white(moduleName)}`
      : `Running module ${chalk.white(moduleName)}`

    ctx.log.header({
      emoji: "runner",
      command: msg,
    })

    await ctx.configureEnvironment({})

    const buildTask = await BuildTask.factory({ ctx, module, force: opts["force-build"] })
    await ctx.addTask(buildTask)
    await ctx.processTasks()

    const command = args.command ? args.command.split(" ") : []

    // combine all dependencies for all services in the module, to be sure we have all the context we need
    const services = await module.getServices()
    const depNames = uniq(flatten(services.map(s => s.config.dependencies)))
    const deps = await ctx.getServices(depNames)

    const runtimeContext = await module.prepareRuntimeContext(deps)

    printRuntimeContext(ctx, runtimeContext)

    ctx.log.info("")

    const result = await ctx.runModule({
      moduleName,
      command,
      runtimeContext,
      silent: false,
      interactive: opts.interactive,
    })

    return { result }
  }
}
