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
  StringsParameter,
  CommandResult,
} from "./base"
import { TaskResults } from "../task-graph"
import { processModules } from "../process"

export const testArgs = {
  module: new StringsParameter({
    help: "The name of the module(s) to deploy (skip to test all modules). " +
      "Use comma as separator to specify multiple modules.",
  }),
}

export const testOpts = {
  name: new StringParameter({
    help: "Only run tests with the specfied name (e.g. unit or integ).",
    alias: "n",
  }),
  force: new BooleanParameter({ help: "Force re-test of module(s).", alias: "f" }),
  "force-build": new BooleanParameter({ help: "Force rebuild of module(s)." }),
  watch: new BooleanParameter({ help: "Watch for changes in module(s) and auto-test.", alias: "w" }),
}

export type Args = ParameterValues<typeof testArgs>
export type Opts = ParameterValues<typeof testOpts>

export class TestCommand extends Command<typeof testArgs, typeof testOpts> {
  name = "test"
  help = "Test all or specified modules."

  description = `
    Runs all or specified tests defined in the project. Also builds modules and dependencies,
    and deploy service dependencies if needed.

    Optionally stays running and automatically re-runs tests if their module source
    (or their dependencies' sources) change.

    Examples:

        garden test              # run all tests in the project
        garden test my-module    # run all tests in the my-module module
        garden test -n integ     # run all tests with the name 'integ' in the project
        garden test --force      # force tests to be re-run, even if they're already run successfully
        garden test --watch      # watch for changes to code
  `

  arguments = testArgs
  options = testOpts

  async action(ctx: PluginContext, args: Args, opts: Opts): Promise<CommandResult<TaskResults>> {
    const modules = await ctx.getModules(args.module)

    ctx.log.header({
      emoji: "thermometer",
      command: `Running tests`,
    })

    await ctx.configureEnvironment({})

    const name = opts.name
    const force = opts.force
    const forceBuild = opts["force-build"]

    const results = await processModules({
      modules,
      pluginContext: ctx,
      watch: opts.watch,
      process: async (module) => module.getTestTasks({ name, force, forceBuild }),
    })

    return handleTaskResults(ctx, "test", results)
  }
}
