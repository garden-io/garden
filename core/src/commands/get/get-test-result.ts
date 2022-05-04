/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, CommandParams } from "../base"
import { testResultSchema } from "../../types/test"
import { printHeader } from "../../logger/util"
import chalk from "chalk"
import { getArtifactFileList, getArtifactKey } from "../../util/artifacts"
import { joi, joiArray } from "../../config/common"
import { getTestActionFromArgs, runTestArgs } from "../run/run-test"

const getTestResultArgs = runTestArgs

type Args = typeof getTestResultArgs

export class GetTestResultCommand extends Command<Args> {
  name = "test-result"
  help = "Outputs the latest execution result of a provided test."

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

  async action({ garden, log, args }: CommandParams<Args>) {
    const graph = await garden.getConfigGraph({ log, emit: true })
    const action = getTestActionFromArgs(graph, args)

    const router = await garden.getActionRouter()

    const res = await router.test.getResult({
      log,
      graph,
      action,
    })

    let artifacts: string[] = []

    if (res.result) {
      artifacts = await getArtifactFileList({
        key: getArtifactKey("test", action.name, action.versionString()),
        artifactsPath: garden.artifactsPath,
        log: garden.log,
      })
    }

    if (res.result === null) {
      log.info(`Could not find results for test '${action.name}'`)
    } else {
      log.info({ data: res.result })
    }

    return { result: { ...res, artifacts } }
  }
}
