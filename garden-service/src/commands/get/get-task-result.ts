/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as yaml from "js-yaml"
import { ConfigGraph } from "../../config-graph"
import {
  Command,
  CommandResult,
  CommandParams,
  StringParameter,
} from "../base"
import { logHeader } from "../../logger/util"
import { highlightYaml } from "../../util/util"
import { getTaskVersion } from "../../tasks/task"
import { RunTaskResult } from "../../types/plugin/outputs"
import { ParameterError } from "../../exceptions"
import chalk from "chalk"

interface TaskResultOutput {
  name: string
  version: string | null
  output: string | null
  startedAt: Date | null
  completedAt: Date | null
}

6
const getTaskResultArgs = {
  name: new StringParameter({
    help: "The name of the task",
    required: true,
  }),
}

type Args = typeof getTaskResultArgs

export class GetTaskResultCommand extends Command<Args> {
  name = "task-result"
  help = "Outputs the latest execution result of a provided task."

  arguments = getTaskResultArgs

  async action({
    garden,
    log,
    args,
  }: CommandParams<Args>): Promise<CommandResult<TaskResultOutput>> {
    const taskName = args.name

    if (!taskName) {
      throw new ParameterError(
        `Failed to find task, provided task name is cannot be empty.`,
        {},
      )
    }

    const graph: ConfigGraph = await garden.getConfigGraph()
    const task = await graph.getTask(taskName)
    const taskResult: RunTaskResult | null = await garden.actions.getTaskResult(
      {
        log,
        task,
        taskVersion: await getTaskVersion(garden, graph, task),
      },
    )

    logHeader({
      log,
      emoji: "rocket",
      command: `Task result for ${chalk.cyan(taskName)}`,
    })

    if (taskResult !== null) {
      const output: TaskResultOutput = {
        name: taskResult.taskName,
        version: taskResult.version.versionString,
        output: taskResult.output,
        startedAt: taskResult.startedAt,
        completedAt: taskResult.completedAt,
      }
      const yamlStatus = yaml.safeDump(taskResult, {
        noRefs: true,
        skipInvalid: true,
      })

      log.info(highlightYaml(yamlStatus))

      return { result: output }
    } else {
      log.info(
        `Task '${taskName}' was found but failed to load task result for it`,
      )
      const output: TaskResultOutput = {
        name: taskName,
        version: null,
        output: null,
        startedAt: null,
        completedAt: null,
      }
      return { result: output }
    }
  }
}
