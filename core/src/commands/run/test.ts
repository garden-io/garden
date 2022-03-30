/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"

import { CommandError, ParameterError } from "../../exceptions"
import { printHeader } from "../../logger/util"
import { TestTask } from "../../tasks/test"
import { testFromConfig } from "../../types/test"
import { dedent, deline } from "../../util/string"
import { findByName, getNames } from "../../util/util"
import {
  Command,
  CommandParams,
  CommandResult,
  resultMetadataKeys,
  graphResultsSchema,
  ProcessResultMetadata,
  handleTaskResult,
} from "../base"
import { joi } from "../../config/common"
import { testResultSchema, TestResult } from "../../types/plugin/module/getTestResult"
import { GraphResults } from "../../task-graph"
import { StringParameter, BooleanParameter } from "../../cli/params"

export const runTestArgs = {
  module: new StringParameter({
    help: "The name of the module to run.",
    required: true,
  }),
  test: new StringParameter({
    help: "The name of the test to run in the module.",
    required: true,
  }),
}

export const runTestOpts = {
  "interactive": new BooleanParameter({
    help:
      "Set to false to skip interactive mode and just output the command result. Note that Garden won't retrieve artifacts if set to true (the default).",
    alias: "i",
    defaultValue: false,
    cliDefault: true,
    cliOnly: true,
  }),
  "force": new BooleanParameter({
    help: "Run the test even if it's disabled for the environment.",
  }),
  "force-build": new BooleanParameter({
    help: "Force rebuild of module before running.",
  }),
}

type Args = typeof runTestArgs
type Opts = typeof runTestOpts

interface RunTestOutput {
  result: TestResult & ProcessResultMetadata
  graphResults: GraphResults
}

export class RunTestCommand extends Command<Args, Opts> {
  name = "test"
  help = "Run the specified module test."

  streamEvents = true

  description = dedent`
    This can be useful for debugging tests, particularly integration/end-to-end tests.

    Examples:

        garden run test my-module integ                      # run the test named 'integ' in my-module
        garden run test my-module integ --interactive=false  # do not attach to the test run, just output results when completed
  `

  arguments = runTestArgs
  options = runTestOpts

  outputsSchema = () =>
    joi.object().keys({
      result: testResultSchema().keys(resultMetadataKeys()).description("The result of the test."),
      graphResults: graphResultsSchema(),
    })

  printHeader({ headerLog, args }) {
    printHeader(headerLog, `Running test ${chalk.cyan(args.test)}`, "runner")
  }

  async action({ garden, log, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<RunTestOutput>> {
    const moduleName = args.module
    const testName = args.test

    const graph = await garden.getConfigGraph({ log, emit: true })
    const module = graph.getModule(moduleName, true)

    const testConfig = findByName(module.testConfigs, testName)

    if (!testConfig) {
      throw new ParameterError(`Could not find test "${testName}" in module ${moduleName}`, {
        moduleName,
        testName,
        availableTests: getNames(module.testConfigs),
      })
    }

    const test = testFromConfig(module, testConfig, graph)

    if ((module.disabled || test.disabled) && !opts.force) {
      throw new CommandError(
        chalk.red(deline`
          Test ${chalk.redBright(`${module.name}.${test.name}`)} is disabled for the
          ${chalk.redBright(garden.environmentName)} environment. If you're sure you want to run it anyway,
          please run the command again with the ${chalk.redBright("--force")} flag.
        `),
        { moduleName: module.name, testName: test.name, environmentName: garden.environmentName }
      )
    }

    const interactive = opts.interactive

    // Make sure all dependencies are ready and collect their outputs for the runtime context
    const testTask = new TestTask({
      force: true,
      silent: false,
      interactive,
      forceBuild: opts["force-build"],
      garden,
      graph,
      log,
      test,
      devModeServiceNames: [],
      hotReloadServiceNames: [],
      localModeServiceNames: [],
    })

    const graphResults = await garden.processTasks([testTask])

    return handleTaskResult({
      log,
      actionDescription: "test",
      graphResults,
      key: testTask.getKey(),
      interactive,
    })
  }
}
