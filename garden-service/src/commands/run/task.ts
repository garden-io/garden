/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { RunResult } from "../../types/plugin/outputs"
import {
  BooleanParameter,
  Command,
  CommandParams,
  StringParameter,
  CommandResult,
} from "../base"
import {
  uniq,
  flatten,
} from "lodash"
import { printRuntimeContext } from "./run"
import dedent = require("dedent")
import { prepareRuntimeContext } from "../../types/service"
import { TaskTask } from "../../tasks/task"

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
    This is useful for re-running tasks on the go, for example after writing/modifying database migrations.

    Examples:

        garden run task my-db-migration   # run my-migration
  `

  arguments = runArgs
  options = runOpts

  async action({ garden, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<RunResult>> {
    const task = await garden.getTask(args.task)
    const module = task.module

    const msg = `Running task ${chalk.white(task.name)}`

    garden.log.header({
      emoji: "runner",
      command: msg,
    })

    await garden.actions.prepareEnvironment({})

    const taskTask = new TaskTask({ garden, task, force: true, forceBuild: opts["force-build"] })
    for (const depTask of await taskTask.getDependencies()) {
      await garden.addTask(depTask)
    }
    await garden.processTasks()

    // combine all dependencies for all services in the module, to be sure we have all the context we need
    const depNames = uniq(flatten(module.serviceConfigs.map(s => s.dependencies)))
    const deps = await garden.getServices(depNames)

    const runtimeContext = await prepareRuntimeContext(garden, module, deps)

    printRuntimeContext(garden, runtimeContext)

    garden.log.info("")

    const result = await garden.actions.runTask({ task, runtimeContext, interactive: true })

    garden.log.info(chalk.white(result.output))

    garden.log.info("")
    garden.log.header({ emoji: "heavy_check_mark", command: `Done!` })

    return { result }
  }
}
