/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  BooleanParameter,
  Command,
  CommandResult,
  CommandParams,
  handleTaskResults,
  ParameterValues,
  StringsParameter,
} from "./base"
import { BuildTask } from "../tasks/build"
import { TaskResults } from "../task-graph"
import dedent = require("dedent")
import { processModules } from "../process"

export const buildArguments = {
  module: new StringsParameter({
    help: "Specify module(s) to build. Use comma separator to specify multiple modules.",
  }),
}

export const buildOptions = {
  force: new BooleanParameter({ help: "Force rebuild of module(s)." }),
  watch: new BooleanParameter({ help: "Watch for changes in module(s) and auto-build.", alias: "w" }),
}

export type BuildArguments = ParameterValues<typeof buildArguments>
export type BuildOptions = ParameterValues<typeof buildOptions>

export class BuildCommand extends Command<typeof buildArguments, typeof buildOptions> {
  name = "build"
  help = "Build your modules."

  description = dedent`
    Builds all or specified modules, taking into account build dependency order.
    Optionally stays running and automatically builds modules if their source (or their dependencies' sources) change.

    Examples:

        garden build            # build all modules in the project
        garden build my-module  # only build my-module
        garden build --force    # force rebuild of modules
        garden build --watch    # watch for changes to code
  `

  arguments = buildArguments
  options = buildOptions

  async action(
    { ctx, args, opts, garden }: CommandParams<BuildArguments, BuildOptions>,
  ): Promise<CommandResult<TaskResults>> {
    await garden.clearBuilds()
    const modules = await ctx.getModules(args.module)

    ctx.log.header({ emoji: "hammer", command: "Build" })

    const results = await processModules({
      modules,
      ctx,
      garden,
      watch: opts.watch,
      process: async (module) => {
        return [await BuildTask.factory({ ctx, module, force: opts.force })]
      },
    })

    return handleTaskResults(ctx, "build", results)
  }
}
