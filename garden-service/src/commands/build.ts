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
  StringsParameter,
  PrepareParams,
} from "./base"
import { BuildTask } from "../tasks/build"
import { TaskResults } from "../task-graph"
import dedent = require("dedent")
import { processModules } from "../process"
import { printHeader } from "../logger/util"
import { startServer, GardenServer } from "../server/server"

const buildArguments = {
  modules: new StringsParameter({
    help: "Specify module(s) to build. Use comma as a separator to specify multiple modules.",
  }),
}

const buildOptions = {
  force: new BooleanParameter({ help: "Force rebuild of module(s)." }),
  watch: new BooleanParameter({
    help: "Watch for changes in module(s) and auto-build.",
    alias: "w",
    cliOnly: true,
  }),
}

type Args = typeof buildArguments
type Opts = typeof buildOptions

export class BuildCommand extends Command<Args, Opts> {
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

  private server: GardenServer

  async prepare({ headerLog, footerLog, opts }: PrepareParams<Args, Opts>) {
    printHeader(headerLog, "Build", "hammer")

    const persistent = !!opts.watch

    if (persistent) {
      this.server = await startServer(footerLog)
    }

    return { persistent }
  }

  async action({ args, opts, garden, log, footerLog }: CommandParams<Args, Opts>): Promise<CommandResult<TaskResults>> {
    if (this.server) {
      this.server.setGarden(garden)
    }

    await garden.clearBuilds()

    const graph = await garden.getConfigGraph()
    const modules = await graph.getModules(args.modules)
    const moduleNames = modules.map((m) => m.name)

    const results = await processModules({
      garden,
      graph: await garden.getConfigGraph(),
      log,
      footerLog,
      modules,
      watch: opts.watch,
      handler: async (_, module) => [new BuildTask({ garden, log, module, force: opts.force })],
      changeHandler: async (_, module) => {
        const dependantModules = (await graph.getDependants("build", module.name, true)).build
        return [module]
          .concat(dependantModules)
          .filter((m) => moduleNames.includes(m.name))
          .map((m) => new BuildTask({ garden, log, module: m, force: true }))
      },
    })

    return handleTaskResults(footerLog, "build", results)
  }
}
