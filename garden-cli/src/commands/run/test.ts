/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { ParameterError } from "../../exceptions"
import { BuildTask } from "../../tasks/build"
import { RunResult } from "../../types/plugin/outputs"
import {
  findByName,
  getNames,
} from "../../util/util"
import {
  BooleanParameter,
  Command,
  CommandParams,
  CommandResult,
  ParameterValues,
  StringParameter,
} from "../base"
import { printRuntimeContext } from "./run"
import dedent = require("dedent")
import { prepareRuntimeContext } from "../../types/service"

export const runArgs = {
  module: new StringParameter({
    help: "The name of the module to run.",
    required: true,
  }),
  test: new StringParameter({
    help: "The name of the test to run in the module.",
    required: true,
  }),
}

export const runOpts = {
  interactive: new BooleanParameter({
    help: "Set to false to skip interactive mode and just output the command result.",
    defaultValue: true,
  }),
  "force-build": new BooleanParameter({ help: "Force rebuild of module before running." }),
}

export type Args = ParameterValues<typeof runArgs>
export type Opts = ParameterValues<typeof runOpts>

export class RunTestCommand extends Command<typeof runArgs, typeof runOpts> {
  name = "test"
  alias = "t"
  help = "Run the specified module test."

  description = dedent`
    This can be useful for debugging tests, particularly integration/end-to-end tests.

    Examples:

        garden run test my-module integ            # run the test named 'integ' in my-module
        garden run test my-module integ --i=false  # do not attach to the test run, just output results when completed
  `

  arguments = runArgs
  options = runOpts

  async action({ garden, ctx, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<RunResult>> {
    const moduleName = args.module
    const testName = args.test
    const module = await ctx.getModule(moduleName)

    const testConfig = findByName(module.testConfigs, testName)

    if (!testConfig) {
      throw new ParameterError(`Could not find test "${testName}" in module ${moduleName}`, {
        moduleName,
        testName,
        availableTests: getNames(module.testConfigs),
      })
    }

    ctx.log.header({
      emoji: "runner",
      command: `Running test ${chalk.cyan(testName)} in module ${chalk.cyan(moduleName)}`,
    })

    await ctx.configureEnvironment({})

    const buildTask = new BuildTask({ ctx, module, force: opts["force-build"] })
    await garden.addTask(buildTask)
    await garden.processTasks()

    const interactive = opts.interactive
    const deps = await ctx.getServices(testConfig.dependencies)
    const runtimeContext = await prepareRuntimeContext(ctx, module, deps)

    printRuntimeContext(ctx, runtimeContext)

    const result = await ctx.testModule({ moduleName, interactive, runtimeContext, silent: false, testConfig })

    return { result }
  }
}
