/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import {
  BooleanParameter,
  Command,
  CommandParams,
  StringParameter,
  CommandResult,
} from "../base"
import dedent = require("dedent")
import { TaskTask } from "../../tasks/task"
import { TaskResult } from "../../task-graph"
import { logHeader } from "../../logger/util"

const runArgs = {
  task: new StringParameter({
    help: "The name of the task to run.",
    required: true,
  }),
}

const runOpts = {
  "force-build": new BooleanParameter({ help: "Force rebuild of module before running." }),
}

type Args = typeof runArgs
type Opts = typeof runOpts

export class RunTaskCommand extends Command<Args, Opts> {
  name = "task"
  alias = "t"
  help = "Run a task (in the context of its parent module)."

  description = dedent`
    This is useful for re-running tasks ad-hoc, for example after writing/modifying database migrations.

    Examples:

        garden run task my-db-migration   # run my-migration
  `

  arguments = runArgs
  options = runOpts

  async action({ garden, log, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<TaskResult>> {
    const graph = await garden.getConfigGraph()
    const task = await graph.getTask(args.task)

    const msg = `Running task ${chalk.white(task.name)}`

    logHeader({ log, emoji: "runner", command: msg })

    await garden.actions.prepareEnvironment({ log })

    const taskTask = new TaskTask({ garden, graph, task, log, force: true, forceBuild: opts["force-build"] })
    await garden.addTask(taskTask)

    const result = (await garden.processTasks())[taskTask.getBaseKey()]

    if (!result.error) {
      log.info("")
      log.info(chalk.white(result.output.output))
      log.info("")
      logHeader({ log, emoji: "heavy_check_mark", command: `Done!` })
    }

    return { result }
  }
}
