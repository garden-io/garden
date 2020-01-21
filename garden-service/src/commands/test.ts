/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { flatten } from "lodash"
import dedent = require("dedent")

import {
  BooleanParameter,
  Command,
  CommandParams,
  CommandResult,
  handleTaskResults,
  StringOption,
  StringsParameter,
  PrepareParams,
} from "./base"
import { TaskResults } from "../task-graph"
import { processModules } from "../process"
import { Module } from "../types/module"
import { getTestTasks } from "../tasks/test"
import { printHeader } from "../logger/util"
import { GardenServer, startServer } from "../server/server"

const testArgs = {
  modules: new StringsParameter({
    help:
      "The name(s) of the module(s) to test (skip to test all modules). " +
      "Use comma as a separator to specify multiple modules.",
  }),
}

const testOpts = {
  "name": new StringOption({
    help:
      "Only run tests with the specfied name (e.g. unit or integ). " +
      "Accepts glob patterns (e.g. integ* would run both 'integ' and 'integration')",
    alias: "n",
  }),
  "force": new BooleanParameter({
    help: "Force re-test of module(s).",
    alias: "f",
  }),
  "force-build": new BooleanParameter({ help: "Force rebuild of module(s)." }),
  "watch": new BooleanParameter({
    help: "Watch for changes in module(s) and auto-test.",
    alias: "w",
    cliOnly: true,
  }),
}

type Args = typeof testArgs
type Opts = typeof testOpts

export class TestCommand extends Command<Args, Opts> {
  name = "test"
  help = "Test all or specified modules."
  protected = true

  description = dedent`
    Runs all or specified tests defined in the project. Also builds modules and dependencies,
    and deploys service dependencies if needed.

    Optionally stays running and automatically re-runs tests if their module source
    (or their dependencies' sources) change.

    Examples:

        garden test               # run all tests in the project
        garden test my-module     # run all tests in the my-module module
        garden test --name integ  # run all tests with the name 'integ' in the project
        garden test --name integ* # run all tests with the name starting with 'integ' in the project
        garden test --force       # force tests to be re-run, even if they've already run successfully
        garden test --watch       # watch for changes to code
  `

  arguments = testArgs
  options = testOpts

  private server: GardenServer

  async prepare({ headerLog, footerLog, opts }: PrepareParams<Args, Opts>) {
    printHeader(headerLog, `Running tests`, "thermometer")

    const persistent = !!opts.watch

    if (persistent) {
      this.server = await startServer(footerLog)
    }

    return { persistent }
  }

  async action({ garden, log, footerLog, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<TaskResults>> {
    if (this.server) {
      this.server.setGarden(garden)
    }

    const graph = await garden.getConfigGraph(log)

    const modules: Module[] = args.modules
      ? await graph.withDependantModules(await graph.getModules({ names: args.modules }))
      : // All modules are included in this case, so there's no need to compute dependants.
        await graph.getModules()

    const filterNames = opts.name ? [opts.name] : []
    const force = opts.force
    const forceBuild = opts["force-build"]

    const initialTasks = flatten(
      await Bluebird.map(modules, (module) =>
        getTestTasks({
          garden,
          log,
          graph,
          module,
          filterNames,
          force,
          forceBuild,
        })
      )
    )

    const results = await processModules({
      garden,
      graph,
      log,
      footerLog,
      modules,
      initialTasks,
      watch: opts.watch,
      changeHandler: async (updatedGraph, module) => {
        const modulesToProcess = await updatedGraph.withDependantModules([module])
        return flatten(
          await Bluebird.map(modulesToProcess, (m) =>
            getTestTasks({
              garden,
              log,
              graph: updatedGraph,
              module: m,
              filterNames,
              force,
              forceBuild,
            })
          )
        )
      },
    })

    return handleTaskResults(footerLog, "test", results)
  }
}
