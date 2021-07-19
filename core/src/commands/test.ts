/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { flatten } from "lodash"
import dedent = require("dedent")

import {
  Command,
  CommandParams,
  CommandResult,
  handleProcessResults,
  PrepareParams,
  ProcessCommandResult,
  processCommandResultSchema,
} from "./base"
import { processModules } from "../process"
import { GardenModule } from "../types/module"
import { getTestTasks } from "../tasks/test"
import { printHeader } from "../logger/util"
import { startServer } from "../server/server"
import { StringsParameter, BooleanParameter } from "../cli/params"
import { deline } from "../util/string"
import { Garden } from "../garden"
import { emitStackGraphEvent } from "./helpers"

export const testArgs = {
  modules: new StringsParameter({
    help: deline`
      The name(s) of the module(s) to test (skip to test all modules).
      Use comma as a separator to specify multiple modules.
    `,
  }),
}

export const testOpts = {
  "name": new StringsParameter({
    help: deline`
      Only run tests with the specfied name (e.g. unit or integ).
      Accepts glob patterns (e.g. integ* would run both 'integ' and 'integration').
    `,
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
  "skip-dependants": new BooleanParameter({
    help: deline`
      When using the modules argument, only run tests for those modules (and skip tests in other modules with
      dependencies on those modules).
    `,
  }),
}

type Args = typeof testArgs
type Opts = typeof testOpts

export class TestCommand extends Command<Args, Opts> {
  name = "test"
  help = "Test all or specified modules."

  protected = true
  workflows = true
  streamEvents = true

  description = dedent`
    Runs all or specified tests defined in the project. Also builds modules and dependencies,
    and deploys service dependencies if needed.

    Optionally stays running and automatically re-runs tests if their module source
    (or their dependencies' sources) change.

    Examples:

        garden test                   # run all tests in the project
        garden test my-module         # run all tests in the my-module module
        garden test --name integ      # run all tests with the name 'integ' in the project
        garden test --name integ*     # run all tests with the name starting with 'integ' in the project
        garden test -n unit -n lint   # run all tests called either 'unit' or 'lint' in the project
        garden test --force           # force tests to be re-run, even if they've already run successfully
        garden test --watch           # watch for changes to code
  `

  arguments = testArgs
  options = testOpts

  outputsSchema = () => processCommandResultSchema()

  private garden?: Garden

  printHeader({ headerLog }) {
    printHeader(headerLog, `Running tests`, "thermometer")
  }

  async prepare({ footerLog, opts }: PrepareParams<Args, Opts>) {
    const persistent = !!opts.watch

    if (persistent) {
      this.server = await startServer({ log: footerLog })
    }

    return { persistent }
  }

  terminate() {
    this.garden?.events.emit("_exit", {})
  }

  async action({
    garden,
    isWorkflowStepCommand,
    log,
    footerLog,
    args,
    opts,
  }: CommandParams<Args, Opts>): Promise<CommandResult<ProcessCommandResult>> {
    this.garden = garden

    if (this.server) {
      this.server.setGarden(garden)
    }

    const graph = await garden.getConfigGraph(log)
    if (!isWorkflowStepCommand) {
      emitStackGraphEvent(garden, graph)
    }
    const skipDependants = opts["skip-dependants"]
    let modules: GardenModule[]

    if (args.modules) {
      modules = skipDependants
        ? graph.getModules({ names: args.modules })
        : graph.withDependantModules(graph.getModules({ names: args.modules }))
    } else {
      modules = graph.getModules()
    }

    const filterNames = opts.name || []
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
          devModeServiceNames: [],
          hotReloadServiceNames: [],
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
              devModeServiceNames: [],
              hotReloadServiceNames: [],
            })
          )
        )
      },
    })

    return handleProcessResults(footerLog, "test", results)
  }
}
