/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ConfigGraph } from "../../graph/config-graph"
import { Command, CommandResult, CommandParams } from "../base"
import { printHeader } from "../../logger/util"
import chalk from "chalk"
import { getArtifactFileList, getArtifactKey } from "../../util/artifacts"
import { taskResultSchema } from "../../types/task"
import { joiArray, joi } from "../../config/common"
import { StringParameter } from "../../cli/params"

const getRunResultArgs = {
  name: new StringParameter({
    help: "The name of the run (or task, if using modules)",
    required: true,
  }),
}

type Args = typeof getRunResultArgs

export class GetRunResultCommand extends Command<Args> {
  name = "run-result"
  help = "Outputs the latest execution result of a provided run (or task, if using modules)."
  aliases = ["task-result"]

  streamEvents = true

  arguments = getRunResultArgs

  outputsSchema = () =>
    taskResultSchema()
      .keys({
        artifacts: joiArray(joi.string()).description("Local file paths to any exported artifacts from the task run."),
      })
      .description("The output from the task. May also return null if no task result is found.")

  printHeader({ headerLog, args }) {
    const taskName = args.name
    printHeader(headerLog, `Task result for task ${chalk.cyan(taskName)}`, "rocket")
  }

  async action({ garden, log, args }: CommandParams<Args>): Promise<CommandResult> {
    const graph: ConfigGraph = await garden.getConfigGraph({ log, emit: true })
    const action = graph.getRun(args.name)

    const actions = await garden.getActionRouter()

    const res = await actions.run.getResult({
      log,
      action,
      graph,
    })

    let artifacts: string[] = []

    if (res.result) {
      artifacts = await getArtifactFileList({
        key: getArtifactKey("task", action.name, action.versionString()),
        artifactsPath: garden.artifactsPath,
        log: garden.log,
      })
    }

    log.info("")

    if (res.result === null) {
      log.info(`Could not find results for ${action.longDescription()}`)
    } else {
      if (res.result === undefined) {
        log.error(`Type ${action.type} for Run ${args.name} does not support storing/getting task results.`)
      } else {
        log.info({ data: res })
      }
    }

    return { result: { ...res, artifacts } }
  }
}
