/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  Command,
  CommandResult,
  CommandParams,
  StringParameter,
} from "../base"
import { NotFoundError } from "../../exceptions"
import { TestResult } from "../../types/plugin/module/getTestResult"
import { getTestVersion } from "../../tasks/test"
import { findByName, getNames } from "../../util/util"
import { printHeader } from "../../logger/util"
import chalk from "chalk"

export interface TestResultOutput {
  module: string
  name: string
  version: string | null
  output: string | null
  startedAt: Date | null
  completedAt: Date | null
}

const getTestResultArgs = {
  module: new StringParameter({
    help: "Module name of where the test runs.",
    required: true,
  }),
  name: new StringParameter({
    help: "Test name.",
    required: true,
  }),
}

type Args = typeof getTestResultArgs

export class GetTestResultCommand extends Command<Args> {
  name = "test-result"
  help = "Outputs the latest execution result of a provided test."

  arguments = getTestResultArgs

  async action({ garden, log, headerLog, args }: CommandParams<Args>): Promise<CommandResult<TestResultOutput>> {
    const testName = args.name
    const moduleName = args.module

    printHeader(
      headerLog,
      `Test result for test ${chalk.cyan(testName)} in module ${chalk.cyan(
        moduleName,
      )}`,
      "heavy_check_mark",
    )

    const graph = await garden.getConfigGraph()
    const actions = await garden.getActionHelper()

    const module = await graph.getModule(moduleName)

    const testConfig = findByName(module.testConfigs, testName)

    if (!testConfig) {
      throw new NotFoundError(
        `Could not find test "${testName}" in module "${moduleName}"`,
        {
          moduleName,
          testName,
          availableTests: getNames(module.testConfigs),
        },
      )
    }

    const testVersion = await getTestVersion(garden, graph, module, testConfig)

    const testResult: TestResult | null = await actions.getTestResult({
      log,
      testName,
      module,
      testVersion,
    })

    if (testResult !== null) {
      const output: TestResultOutput = {
        name: testResult.testName,
        module: testResult.moduleName,
        startedAt: testResult.startedAt,
        completedAt: testResult.completedAt,
        version: testResult.version.versionString,
        output: testResult.output,
      }

      log.info({ data: testResult })
      return { result: output }
    } else {
      const errorMessage = `Could not find results for test '${testName}'`

      log.info(errorMessage)

      const output: TestResultOutput = {
        name: testName,
        module: moduleName,
        version: null,
        output: null,
        startedAt: null,
        completedAt: null,
      }
      return { result: output }
    }
  }
}
