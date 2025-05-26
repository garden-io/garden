/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CommandParams } from "../base.js"
import { Command } from "../base.js"
import { printHeader } from "../../logger/util.js"
import { getArtifactFileList, getArtifactKey } from "../../util/artifacts.js"
import { joi, joiArray } from "../../config/common.js"
import type { GetTestResult } from "../../plugin/handlers/Test/get-result.js"
import { getTestResultSchema } from "../../plugin/handlers/Test/get-result.js"
import type { ParameterValues } from "../../cli/params.js"
import { StringOption, StringParameter } from "../../cli/params.js"
import { ParameterError } from "../../exceptions.js"
import type { ConfigGraph } from "../../graph/config-graph.js"
import type { GardenModule } from "../../types/module.js"
import { moduleTestNameToActionName } from "../../types/module.js"
import { findByName, getNames } from "../../util/util.js"
import { createActionLog } from "../../logger/log-entry.js"
import dedent from "dedent"
import { naturalList } from "../../util/string.js"
import { styles } from "../../logger/styles.js"

const getTestResultArgs = {
  name: new StringParameter({
    help: "The name of the test. If this test belongs to a module, specify the module name here instead, and specify the test name from the module in the second argument.",
    required: true,
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.actionConfigs.Test)
    },
  }),
  moduleTestName: new StringOption({
    help: "When the test belongs to a module, specify its name here (i.e. as the second argument).",
    required: false,
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.moduleConfigs)
    },
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

  override streamEvents = true

  override arguments = getTestResultArgs

  override outputsSchema = () =>
    getTestResultSchema()
      .keys({
        artifacts: joiArray(joi.string()).description("Local file paths to any exported artifacts from the test run."),
      })
      .description("The result from the test. May also return null if no test result is found.")

  override printHeader({ log, args }) {
    const testName = args.name
    const moduleName = args.module

    printHeader(
      log,
      `Test result for test ${styles.highlight(testName)} in module ${styles.highlight(moduleName)}`,
      "✔️"
    )
  }

  async action({ garden, log, args }: CommandParams<Args>) {
    const graph = await garden.getConfigGraph({ log, emit: true })
    const action = getTestActionFromArgs(graph, args)

    const router = await garden.getActionRouter()

    const resolved = await garden.resolveAction({ action, graph, log })
    const actionLog = createActionLog({ log, actionName: action.name, actionKind: action.kind })

    const { result: res } = await router.test.getResult({
      log: actionLog,
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
      throw new ParameterError({
        message: dedent`
          Could not find module "${moduleName}" to run test "${testName}" from.
        `,
      })
    }

    const testConfig = findByName(module.testConfigs, args.moduleTestName)

    if (!testConfig) {
      throw new ParameterError({
        message: dedent`
          Could not find test "${testName}" in module "${moduleName}".
          Available tests: ${naturalList(getNames(module.testConfigs))}
        `,
      })
    }

    return graph.getTest(moduleTestNameToActionName(moduleName, testName))
  } else {
    return graph.getTest(args.name, { includeDisabled: true })
  }
}
