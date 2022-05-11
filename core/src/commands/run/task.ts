/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import {
  Command,
  CommandParams,
  CommandResult,
  handleTaskResult,
  ProcessResultMetadata,
  resultMetadataKeys,
  graphResultsSchema,
} from "../base"
import { TaskTask } from "../../tasks/task"
import { GraphResults } from "../../task-graph"
import { printHeader } from "../../logger/util"
import { CommandError } from "../../exceptions"
import { dedent, deline } from "../../util/string"
import { RunTaskResult } from "../../types/plugin/task/runTask"
import { taskResultSchema } from "../../types/plugin/task/getTaskResult"
import { joi } from "../../config/common"
import { StringParameter, BooleanParameter } from "../../cli/params"

export const runTaskArgs = {
  task: new StringParameter({
    help: "The name of the task to run.",
    required: true,
  }),
}

export const runTaskOpts = {
  "force": new BooleanParameter({
    help: "Run the task even if it's disabled for the environment.",
  }),
  "force-build": new BooleanParameter({
    help: "Force rebuild of module before running.",
  }),
}

type Args = typeof runTaskArgs
type Opts = typeof runTaskOpts

interface RunTaskOutput {
  result: RunTaskResult & ProcessResultMetadata
  graphResults: GraphResults
}

export class RunTaskCommand extends Command<Args, Opts> {
  name = "task"
  alias = "t"
  help = "Run a task (in the context of its parent module)."

  streamEvents = true

  description = dedent`
    This is useful for re-running tasks ad-hoc, for example after writing/modifying database migrations.

    Examples:

        garden run task my-db-migration   # run my-migration
  `

  arguments = runTaskArgs
  options = runTaskOpts

  outputsSchema = () =>
    joi.object().keys({
      result: taskResultSchema().keys(resultMetadataKeys()).description("The result of the task."),
      graphResults: graphResultsSchema(),
    })

  printHeader({ headerLog, args }) {
    const msg = `Running task ${chalk.white(args.task)}`
    printHeader(headerLog, msg, "runner")
  }

  async action({ garden, log, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<RunTaskOutput>> {
    const graph = await garden.getConfigGraph({ log, emit: true })
    const task = graph.getTask(args.task, true)

    if (task.disabled && !opts.force) {
      throw new CommandError(
        chalk.red(deline`
          Task ${chalk.redBright(task.name)} is disabled for the ${chalk.redBright(garden.environmentName)}
          environment. If you're sure you want to run it anyway, please run the command again with the
          ${chalk.redBright("--force")} flag.
        `),
        { moduleName: task.module.name, taskName: task.name, environmentName: garden.environmentName }
      )
    }

    const taskTask = new TaskTask({
      garden,
      graph,
      task,
      log,
      force: true,
      forceBuild: opts["force-build"],
      devModeServiceNames: [],
      hotReloadServiceNames: [],
      localModeServiceNames: [],
    })
    const graphResults = await garden.processTasks([taskTask])

    return handleTaskResult({ log, actionDescription: "task", graphResults, key: taskTask.getKey() })
  }
}
