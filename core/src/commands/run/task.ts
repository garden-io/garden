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
import { RunTask } from "../../tasks/task"
import { GraphResults } from "../../task-graph"
import { printHeader } from "../../logger/util"
import { CommandError } from "../../exceptions"
import { dedent, deline } from "../../util/string"
import { taskResultSchema } from "../../types/task"
import { joi } from "../../config/common"
import { StringParameter, BooleanParameter } from "../../cli/params"
import { GetRunResult } from "../../plugin/handlers/run/get-result"

const runTaskArgs = {
  name: new StringParameter({
    help: "The name of Run action.",
    required: true,
  }),
}

const runTaskOpts = {
  "force": new BooleanParameter({
    help: "Run even if the action is disabled for the environment.",
  }),
  "force-build": new BooleanParameter({
    help: "Force rebuild of Build dependencies before running.",
  }),
}

type Args = typeof runTaskArgs
type Opts = typeof runTaskOpts

interface RunTaskOutput {
  result: GetRunResult & ProcessResultMetadata
  graphResults: GraphResults
}

export class RunTaskCommand extends Command<Args, Opts> {
  name = "run"
  alias = "task"
  help = "Run a task (in the context of its parent module)."

  streamEvents = true

  description = dedent`
    This is useful for any ad-hoc runs, for example database migrations, or when developing.

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
    const msg = `Running ${chalk.white(args.task)}`
    printHeader(headerLog, msg, "runner")
  }

  async action({ garden, log, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<RunTaskOutput>> {
    const graph = await garden.getConfigGraph({ log, emit: true })
    const action = graph.getRun(args.name, { includeDisabled: true })

    if (action.isDisabled() && !opts.force) {
      throw new CommandError(
        chalk.red(deline`
          Task ${chalk.redBright(action.name)} is disabled for the ${chalk.redBright(garden.environmentName)}
          environment. If you're sure you want to run it anyway, please run the command again with the
          ${chalk.redBright("--force")} flag.
        `),
        { moduleName: action.moduleName(), actionName: action.name, environmentName: garden.environmentName }
      )
    }

    const taskTask = new RunTask({
      garden,
      graph,
      action,
      log,
      force: true,
      forceBuild: opts["force-build"],
      devModeDeployNames: [],
      localModeDeployNames: [],
      fromWatch: false,
    })
    const graphResults = await garden.processTasks([taskTask], { throwOnError: true })

    return handleTaskResult({ log, actionDescription: "task", graphResults, key: taskTask.getKey() })
  }
}
