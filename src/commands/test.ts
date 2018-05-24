/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginContext } from "../plugin-context"
import {
  BooleanParameter,
  Command,
  handleTaskResults,
  ParameterValues,
  StringParameter,
  CommandResult,
} from "./base"
import { TaskResults } from "../task-graph"

export const testArgs = {
  module: new StringParameter({
    help: "The name of the module(s) to deploy (skip to test all modules). " +
      "Use comma as separator to specify multiple modules.",
  }),
}

export const testOpts = {
  group: new StringParameter({
    help: "Only run tests with the specfied group (e.g. unit or integ)",
    alias: "g",
  }),
  force: new BooleanParameter({ help: "Force re-test of module(s)", alias: "f" }),
  "force-build": new BooleanParameter({ help: "Force rebuild of module(s)" }),
  watch: new BooleanParameter({ help: "Watch for changes in module(s) and auto-test", alias: "w" }),
}

export type Args = ParameterValues<typeof testArgs>
export type Opts = ParameterValues<typeof testOpts>

export class TestCommand extends Command<typeof testArgs, typeof testOpts> {
  name = "test"
  help = "Test all or specified modules"

  arguments = testArgs
  options = testOpts

  async action(ctx: PluginContext, args: Args, opts: Opts): Promise<CommandResult<TaskResults>> {
    const names = args.module ? args.module.split(",") : undefined
    const modules = await ctx.getModules(names)

    ctx.log.header({
      emoji: "thermometer",
      command: `Running tests`,
    })

    await ctx.configureEnvironment({})

    const group = opts.group
    const force = opts.force
    const forceBuild = opts["force-build"]

    const results = await ctx.processModules({
      modules,
      watch: opts.watch,
      process: async (module) => module.getTestTasks({ group, force, forceBuild }),
    })

    return handleTaskResults(ctx, "test", results)
  }
}
