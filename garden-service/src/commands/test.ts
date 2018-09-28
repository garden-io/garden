/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Bluebird from "bluebird"
import { flatten } from "lodash"
import {
  BooleanParameter,
  Command,
  CommandParams,
  CommandResult,
  handleTaskResults,
  StringOption,
  StringsParameter,
} from "./base"
import { TaskResults } from "../task-graph"
import { processModules } from "../process"
import { Module } from "../types/module"
import { getTestTasks } from "../tasks/test"
import { computeAutoReloadDependants, withDependants } from "../watch"

const testArgs = {
  module: new StringsParameter({
    help: "The name of the module(s) to deploy (skip to test all modules). " +
      "Use comma as separator to specify multiple modules.",
  }),
}

const testOpts = {
  name: new StringOption({
    help: "Only run tests with the specfied name (e.g. unit or integ).",
    alias: "n",
  }),
  force: new BooleanParameter({ help: "Force re-test of module(s).", alias: "f" }),
  "force-build": new BooleanParameter({ help: "Force rebuild of module(s)." }),
  watch: new BooleanParameter({ help: "Watch for changes in module(s) and auto-test.", alias: "w" }),
}

type Args = typeof testArgs
type Opts = typeof testOpts

export class TestCommand extends Command<Args, Opts> {
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

  async action({ garden, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<TaskResults>> {
    const autoReloadDependants = await computeAutoReloadDependants(garden)
    let modules: Module[]
    if (args.module) {
      modules = await withDependants(garden, await garden.getModules(args.module), autoReloadDependants)
    } else {
      // All modules are included in this case, so there's no need to compute dependants.
      modules = await garden.getModules()
    }

    garden.log.header({
      emoji: "thermometer",
      command: `Running tests`,
    })

    await garden.actions.prepareEnvironment({})

    const name = opts.name
    const force = opts.force
    const forceBuild = opts["force-build"]

    const results = await processModules({
      garden,
      modules,
      watch: opts.watch,
      handler: async (module) => getTestTasks({ garden, module, name, force, forceBuild }),
      changeHandler: async (module) => {
        const modulesToProcess = await withDependants(garden, [module], autoReloadDependants)
        return flatten(await Bluebird.map(
          modulesToProcess,
          m => getTestTasks({ garden, module: m, name, force, forceBuild })))
      },
    })

    return handleTaskResults(garden, "test", results)
  }
}
