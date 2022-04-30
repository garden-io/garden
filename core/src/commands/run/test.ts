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
import { testResultSchema } from "../../types/test"
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
import { TestResult } from "../../types/test"
import { GraphResults } from "../../task-graph"
import { StringParameter, BooleanParameter } from "../../cli/params"
import { TestAction } from "../../actions/test"
import { GardenModule, moduleTestNameToActionName } from "../../types/module"

export const runTestArgs = {
  name: new StringParameter({
    help: "The action to run. If using modules, specify the module name here and the test name in the second argument",
    required: true,
  }),
  moduleTestName: new StringParameter({
    help: "The name of the test to run in the module.",
    required: false,
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
  help = "Run the specified test."

  streamEvents = true

  description = dedent`
    This can be useful for debugging tests, particularly integration/end-to-end tests.

    Examples:

        garden run test my-test                      # run the my-test Test action named
        garden run test my-test --interactive=false  # do not attach to the test run, just output results when completed
        garden run test my-module integ              # run the test named 'integ' in module 'my-module'
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
    let action: TestAction

    const graph = await garden.getConfigGraph({ log, emit: true })

    if (args.moduleTestName) {
      // We're getting a test from a specific module.
      let module: GardenModule
      const moduleName = args.name
      const testName = args.moduleTestName

      try {
        module = graph.getModule(args.name, true)
      } catch (err) {
        throw new ParameterError(
          `Two arguments were provided, so we looked for a Module named '${moduleName}, but could not find it.`,
          {
            moduleName,
            testName,
          }
        )
      }

      const testConfig = findByName(module.testConfigs, args.moduleTestName)

      if (!testConfig) {
        throw new ParameterError(`Could not find test "${testName}" in module ${moduleName}`, {
          moduleName,
          testName,
          availableTests: getNames(module.testConfigs),
        })
      }

      action = graph.getTest(moduleTestNameToActionName(moduleName, testName))
    } else {
      action = graph.getTest(args.name, { includeDisabled: true })
    }

    if (action.isDisabled() && !opts.force) {
      throw new CommandError(
        chalk.red(deline`
          ${action.longDescription()} is disabled for the ${chalk.redBright(garden.environmentName)} environment.
          If you're sure you want to run it anyway,
          please run the command again with the ${chalk.redBright("--force")} flag.
        `),
        { actionName: action.name, moduleName: action.moduleName(), environmentName: garden.environmentName }
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
      action,
      devModeDeployNames: [],
      localModeDeployNames: [],
      fromWatch: false,
    })

    const graphResults = await garden.processTasks([testTask], { throwOnError: true })

    return handleTaskResult({
      log,
      actionDescription: "test",
      graphResults,
      key: testTask.getKey(),
      interactive,
    })
  }
}
