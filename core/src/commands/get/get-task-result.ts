/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ConfigGraph } from "../../config-graph"
import { Command, CommandResult, CommandParams } from "../base"
import { printHeader } from "../../logger/util"
import { RunTaskResult } from "../../types/plugin/task/runTask"
import chalk from "chalk"
import { getArtifactFileList, getArtifactKey } from "../../util/artifacts"
import { taskResultSchema } from "../../types/plugin/task/getTaskResult"
import { joiArray, joi } from "../../config/common"
import { StringParameter } from "../../cli/params"
import { emitStackGraphEvent } from "../helpers"

const getTaskResultArgs = {
  name: new StringParameter({
    help: "The name of the task",
    required: true,
  }),
}

type Args = typeof getTaskResultArgs

interface Result extends RunTaskResult {
  artifacts: string[]
}

export type GetTaskResultCommandResult = Result | null

export class GetTaskResultCommand extends Command<Args> {
  name = "task-result"
  help = "Outputs the latest execution result of a provided task."

  workflows = true
  streamEvents = true

  arguments = getTaskResultArgs

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

  async action({
    garden,
    isWorkflowStepCommand,
    log,
    args,
  }: CommandParams<Args>): Promise<CommandResult<GetTaskResultCommandResult>> {
    const taskName = args.name

    const graph: ConfigGraph = await garden.getConfigGraph(log)
    if (!isWorkflowStepCommand) {
      emitStackGraphEvent(garden, graph)
    }
    const task = graph.getTask(taskName)

    const actions = await garden.getActionRouter()

    const taskResult = await actions.getTaskResult({
      log,
      task,
    })

    let result: GetTaskResultCommandResult = null

    if (taskResult) {
      const artifacts = await getArtifactFileList({
        key: getArtifactKey("task", task.name, task.version),
        artifactsPath: garden.artifactsPath,
        log: garden.log,
      })
      result = {
        ...taskResult,
        artifacts,
      }
    }

    log.info("")

    if (taskResult === null) {
      log.info(`Could not find results for task '${taskName}'`)
    } else {
      if (taskResult === undefined) {
        log.error(`Module type ${task.module.type} for task ${taskName} does not support storing/getting task results.`)
      } else {
        log.info({ data: result })
      }
    }

    return { result }
  }
}
