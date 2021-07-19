/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, CommandResult, CommandParams } from "../base"
import { TestResult, testResultSchema } from "../../types/plugin/module/getTestResult"
import { printHeader } from "../../logger/util"
import chalk from "chalk"
import { getArtifactFileList, getArtifactKey } from "../../util/artifacts"
import { joi, joiArray } from "../../config/common"
import { StringParameter } from "../../cli/params"
import { testFromModule } from "../../types/test"
import { emitStackGraphEvent } from "../helpers"

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

interface Result extends TestResult {
  artifacts: string[]
}

export type GetTestResultCommandResult = Result | null

type Args = typeof getTestResultArgs

export class GetTestResultCommand extends Command<Args> {
  name = "test-result"
  help = "Outputs the latest execution result of a provided test."

  workflows = true
  streamEvents = true

  arguments = getTestResultArgs

  outputsSchema = () =>
    testResultSchema()
      .keys({
        artifacts: joiArray(joi.string()).description("Local file paths to any exported artifacts from the test run."),
      })
      .description("The result from the test. May also return null if no test result is found.")

  printHeader({ headerLog, args }) {
    const testName = args.name
    const moduleName = args.module

    printHeader(
      headerLog,
      `Test result for test ${chalk.cyan(testName)} in module ${chalk.cyan(moduleName)}`,
      "heavy_check_mark"
    )
  }

  async action({
    garden,
    isWorkflowStepCommand,
    log,
    args,
  }: CommandParams<Args>): Promise<CommandResult<GetTestResultCommandResult>> {
    const testName = args.name
    const moduleName = args.module

    const graph = await garden.getConfigGraph(log)
    if (!isWorkflowStepCommand) {
      emitStackGraphEvent(garden, graph)
    }
    const actions = await garden.getActionRouter()

    const module = graph.getModule(moduleName)
    const test = testFromModule(module, testName, graph)

    const testResult = await actions.getTestResult({
      log,
      test,
      module,
    })

    let result: GetTestResultCommandResult = null

    if (testResult) {
      const artifacts = await getArtifactFileList({
        key: getArtifactKey("test", testName, test.version),
        artifactsPath: garden.artifactsPath,
        log: garden.log,
      })
      result = {
        ...testResult,
        artifacts,
      }
    }

    if (result === null) {
      log.info(`Could not find results for test '${testName}'`)
    } else {
      log.info({ data: result })
    }

    return { result }
  }
}
