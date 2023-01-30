/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, CommandParams } from "../base"
import { printHeader } from "../../logger/util"
import chalk from "chalk"
import { getArtifactFileList, getArtifactKey } from "../../util/artifacts"
import { joi, joiArray } from "../../config/common"
import { GetTestResult, getTestResultSchema } from "../../plugin/handlers/Test/get-result"
import { ParameterValues, StringOption, StringParameter } from "../../cli/params"
import { ParameterError } from "../../exceptions"
import { ConfigGraph } from "../../graph/config-graph"
import { GardenModule, moduleTestNameToActionName } from "../../types/module"
import { findByName, getNames } from "../../util/util"

const getTestResultArgs = {
  name: new StringParameter({
    help:
      "The name of the test. If this test belongs to a module, specify the module name here instead, and specify the test name from the module in the second argument.",
    required: true,
  }),
  moduleTestName: new StringOption({
    help: "When the test belongs to a module, specify its name here (i.e. as the second argument).",
    required: false,
  }),
}

type Args = typeof getTestResultArgs

interface Result extends GetTestResult {
  artifacts: string[]
}

export type GetTestResultCommandResult = Result | null

export class GetTestResultCommand extends Command<Args, {}, GetTestResultCommandResult> {
  name = "test-result"
  help = "Outputs the latest execution result of a provided test."

  streamEvents = true

  arguments = getTestResultArgs

  outputsSchema = () =>
    getTestResultSchema()
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

  async action({ garden, log, args }: CommandParams<Args>) {
    const graph = await garden.getConfigGraph({ log, emit: true })
    const action = getTestActionFromArgs(graph, args)

    const router = await garden.getActionRouter()

    const resolved = await garden.resolveAction({ action, graph, log })

    const res = await router.test.getResult({
      log,
      graph,
      action: resolved,
    })

    let artifacts: string[] = []

    if (res.detail) {
      artifacts = await getArtifactFileList({
        key: getArtifactKey("test", action.name, action.versionString()),
        artifactsPath: garden.artifactsPath,
        log: garden.log,
      })
    }

    if (res.detail === null) {
      log.info(`Could not find results for test '${action.name}'`)
    } else {
      log.info({ data: res.detail })
    }

    return { result: { ...res, artifacts } }
  }
}

export function getTestActionFromArgs(graph: ConfigGraph, args: ParameterValues<Args>) {
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

    return graph.getTest(moduleTestNameToActionName(moduleName, testName))
  } else {
    return graph.getTest(args.name, { includeDisabled: true })
  }
}
