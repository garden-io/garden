/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { BooleanParameter, Command, CommandParams, StringParameter, CommandResult } from "../base"
import dedent = require("dedent")
import { TaskTask } from "../../tasks/task"
import { TaskResult } from "../../task-graph"
import { printHeader, printFooter } from "../../logger/util"

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

  async action({
    garden,
    log,
    headerLog,
    footerLog,
    args,
    opts,
  }: CommandParams<Args, Opts>): Promise<CommandResult<TaskResult | null>> {
    const graph = await garden.getConfigGraph(log)
    const task = await graph.getTask(args.task)

    const msg = `Running task ${chalk.white(task.name)}`

    printHeader(headerLog, msg, "runner")

    const taskTask = await TaskTask.factory({ garden, graph, task, log, force: true, forceBuild: opts["force-build"] })
    const result = (await garden.processTasks([taskTask]))[taskTask.getKey()]

    if (result && !result.error) {
      log.info("")
      // TODO: The command will need to be updated to stream logs: see https://github.com/garden-io/garden/issues/630.
      // It's ok with the current providers but the shape might change in the future.
      log.info(chalk.white(result.output.outputs.log.trim()))
      printFooter(footerLog)
    }

    return { result }
  }
}
