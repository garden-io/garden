/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { ParameterError } from "../../exceptions"
import { RunResult } from "../../types/plugin/base"
import { findByName, getNames } from "../../util/util"
import { BooleanParameter, Command, CommandParams, CommandResult, StringParameter } from "../base"
import { printRuntimeContext } from "./run"
import dedent = require("dedent")
import { prepareRuntimeContext } from "../../runtime-context"
import { printHeader } from "../../logger/util"
import { getTestVersion, TestTask } from "../../tasks/test"
import { getRunTaskResults, getServiceStatuses } from "../../tasks/base"

const runArgs = {
  module: new StringParameter({
    help: "The name of the module to run.",
    required: true,
  }),
  test: new StringParameter({
    help: "The name of the test to run in the module.",
    required: true,
  }),
}

const runOpts = {
  "interactive": new BooleanParameter({
    help: "Set to false to skip interactive mode and just output the command result.",
    defaultValue: false,
    cliDefault: true,
    cliOnly: true,
  }),
  "force-build": new BooleanParameter({
    help: "Force rebuild of module before running.",
  }),
}

type Args = typeof runArgs
type Opts = typeof runOpts

export class RunTestCommand extends Command<Args, Opts> {
  name = "test"
  help = "Run the specified module test."

  description = dedent`
    This can be useful for debugging tests, particularly integration/end-to-end tests.

    Examples:

        garden run test my-module integ            # run the test named 'integ' in my-module
        garden run test my-module integ --i=false  # do not attach to the test run, just output results when completed
  `

  arguments = runArgs
  options = runOpts

  async action({ garden, log, headerLog, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<RunResult>> {
    const moduleName = args.module
    const testName = args.test

    const graph = await garden.getConfigGraph(log)
    const module = await graph.getModule(moduleName)

    const testConfig = findByName(module.testConfigs, testName)

    if (!testConfig) {
      throw new ParameterError(`Could not find test "${testName}" in module ${moduleName}`, {
        moduleName,
        testName,
        availableTests: getNames(module.testConfigs),
      })
    }

    printHeader(headerLog, `Running test ${chalk.cyan(testName)} in module ${chalk.cyan(moduleName)}`, "runner")

    const actions = await garden.getActionRouter()
    const version = await getTestVersion(garden, graph, module, testConfig)

    // Make sure all dependencies are ready and collect their outputs for the runtime context
    const testTask = new TestTask({
      force: true,
      forceBuild: opts["force-build"],
      garden,
      graph,
      log,
      module,
      testConfig,
      version,
    })
    const dependencyResults = await garden.processTasks(await testTask.getDependencies())

    const interactive = opts.interactive
    const dependencies = await graph.getDependencies("test", testConfig.name, false)

    const serviceStatuses = getServiceStatuses(dependencyResults)
    const taskResults = getRunTaskResults(dependencyResults)

    const runtimeContext = await prepareRuntimeContext({
      garden,
      graph,
      dependencies,
      module,
      serviceStatuses,
      taskResults,
    })

    printRuntimeContext(log, runtimeContext)

    const result = await actions.testModule({
      log,
      module,
      interactive,
      runtimeContext,
      silent: false,
      testConfig,
      testVersion: version,
    })

    return { result }
  }
}
