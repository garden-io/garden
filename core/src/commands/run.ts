/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { Command, CommandParams, graphResultsSchema } from "./base"
import { RunTask } from "../tasks/run"
import { GraphResult } from "../graph/results"
import { printHeader, renderDivider } from "../logger/util"
import { CommandError } from "../exceptions"
import { dedent, deline } from "../util/string"
import { joi } from "../config/common"
import { StringParameter, BooleanParameter } from "../cli/params"
import { GetRunResult, getRunResultSchema } from "../plugin/handlers/run/get-result"
import { emitWarning } from "../warnings"

const runArgs = {
  name: new StringParameter({
    help: "The name of Run action.",
    required: true,
  }),
}

const runOpts = {
  "force": new BooleanParameter({
    help: "Run even if the action is disabled for the environment.",
  }),
  "force-build": new BooleanParameter({
    help: "Force rebuild of Build dependencies before running.",
  }),
}

type Args = typeof runArgs
type Opts = typeof runOpts

type RunOutput = GraphResult<GetRunResult>

export class RunCommand extends Command<Args, Opts, RunOutput> {
  name = "run"
  help = "Perform a Run action"

  streamEvents = true

  description = dedent`
    This is useful for any ad-hoc Runs, for example database migrations, or when developing.

    Examples:

        garden run my-db-migration   # run my-db-migration
  `

  arguments = runArgs
  options = runOpts

  outputsSchema = () =>
    joi.object().keys({
      result: getRunResultSchema().description("The result of the Run action."),
      graphResults: graphResultsSchema(),
    })

  printHeader({ headerLog, args }) {
    const msg = `Running ${chalk.white(args.task)}`
    printHeader(headerLog, msg, "runner")
  }

  async action({ garden, log, args, opts }: CommandParams<Args, Opts>) {
    const graph = await garden.getConfigGraph({ log, emit: true })
    const action = graph.getRun(args.name, { includeDisabled: true })

    if (action.isDisabled() && !opts.force) {
      throw new CommandError(
        chalk.red(deline`
          ${chalk.redBright(action.longDescription())} is disabled for the ${chalk.redBright(garden.environmentName)}
          environment. If you're sure you want to run it anyway, please run the command again with the
          ${chalk.redBright("--force")} flag.
        `),
        { moduleName: action.moduleName(), actionName: action.name, environmentName: garden.environmentName }
      )
    }

    // Warn users if they seem to be using old `run <...>` commands.
    const divider = renderDivider()
    const warningKey = `run-${args.name}-removed`

    if (args.name === "test") {
      await emitWarning({
        key: warningKey,
        log,
        message: chalk.yellowBright(
          dedent`
            ${divider}
            The ${chalk.white("garden run test")} command has been removed.
            Please use ${chalk.whiteBright("garden test")} instead.
            ${divider}
          `
        ),
      })
    } else if (args.name === "task") {
      await emitWarning({
        key: warningKey,
        log,
        message: chalk.yellowBright(
          dedent`
            ${divider}
            The ${chalk.white("garden run task")} command has been renamed to
            ${chalk.whiteBright("garden run")}. Please make sure you're using the right syntax.
            ${divider}
          `
        ),
      })
    } else if (args.name === "module" || args.name === "service") {
      await emitWarning({
        key: warningKey,
        log,
        message: chalk.yellowBright(
          dedent`
            ${divider}
            The ${chalk.white("garden run " + args.name)} command has been removed.
            Please define a Run action instead, or use the underlying tools (e.g. Docker or Kubernetes) directly.
            ${divider}
          `
        ),
      })
    } else if (args.name === "workflow") {
      await emitWarning({
        key: warningKey,
        log,
        message: chalk.yellowBright(
          dedent`
            ${divider}
            The ${chalk.white("garden run workflow")} command has been renamed to
            ${chalk.whiteBright("garden run-workflow")} (note the dash).
            ${divider}
          `
        ),
      })
    }

    // TODO-G2: make this implementation more similar to e.g. the test command.
    // TODO-G2: support interactive execution for a single Run.

    const runTask = new RunTask({
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

    const result = await garden.processTask(runTask, log, { throwOnError: true })

    return {
      result: result!,
    }
  }
}
