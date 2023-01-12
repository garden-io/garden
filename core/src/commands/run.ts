/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { Command, CommandParams, graphResultsSchema, handleProcessResults, PrepareParams } from "./base"
import { RunTask } from "../tasks/run"
import { printHeader, renderDivider } from "../logger/util"
import { CommandError, ParameterError } from "../exceptions"
import { dedent, deline } from "../util/string"
import { joi } from "../config/common"
import { BooleanParameter, StringsParameter } from "../cli/params"
import { getRunResultSchema } from "../plugin/handlers/run/get-result"
import { emitWarning } from "../warnings"
import { startServer } from "../server/server"
import { Garden } from "../garden"
import { isRunAction } from "../actions/run"
import { processActions } from "../process"

// TODO-G2: support interactive execution for a single Run (needs implementation from RunTask through plugin handlers).

const runArgs = {
  names: new StringsParameter({
    help: deline`
      The name(s) of the Run action(s) to perform.
      Use comma as a separator to specify multiple names.
      Accepts glob patterns (e.g. init* would run both 'init' and 'initialize').
    `,
  }),
}

const runOpts = {
  "force": new BooleanParameter({
    help: "Run even if the action is disabled for the environment, and/or a successful result is found in cache.",
  }),
  "force-build": new BooleanParameter({
    help: "Force re-build of Build dependencies before running.",
  }),
  // "interactive": new BooleanParameter({
  //   help:
  //     "Perform the specified Run in interactive mode (i.e. to allow attaching to a shell). A single Run must be selected, otherwise an error is thrown.",
  //   alias: "i",
  //   cliOnly: true,
  // }),
  "module": new StringsParameter({
    help: deline`
      The name(s) of one or modules to pull Runs/tasks from. If both this and Run names are specified, the Run names filter the tasks found in the specified modules.
    `,
  }),
  "watch": new BooleanParameter({
    help: "Watch for changes in module(s) and auto-test.",
    alias: "w",
    cliOnly: true,
  }),
  "skip": new StringsParameter({
    help: deline`
      The name(s) of Runs you'd like to skip. Accepts glob patterns
      (e.g. init* would skip both 'init' and 'initialize').
    `,
  }),
  "skip-dependencies": new BooleanParameter({
    help: dedent`
      Don't perform any Deploy or Run actions that the requested Runs depend on.
      This can be useful e.g. when your stack has already been deployed, and you want to run tests with runtime
      dependencies without redeploying any service dependencies that may have changed since you last deployed.

      Warning: Take great care when using this option in CI, since Garden won't ensure that the runtime dependencies of
      your test suites are up to date when this option is used.
    `,
    alias: "nodeps",
  }),
}

type Args = typeof runArgs
type Opts = typeof runOpts

export class RunCommand extends Command<Args, Opts> {
  name = "run"
  help = "Perform one or more Run actions"

  streamEvents = true

  description = dedent`
    This is useful for any ad-hoc Runs, for example database migrations, or when developing.

    Examples:

        garden run my-db-migration   # run my-db-migration
  `

  arguments = runArgs
  options = runOpts

  private garden?: Garden

  outputsSchema = () =>
    joi.object().keys({
      result: getRunResultSchema().description("The result of the Run action."),
      graphResults: graphResultsSchema(),
    })

  printHeader({ headerLog }: PrepareParams<Args, Opts>) {
    const msg = `Run`
    printHeader(headerLog, msg, "runner")
  }

  isPersistent({ opts }: PrepareParams<Args, Opts>) {
    return !!opts.watch
  }

  async prepare(params: PrepareParams<Args, Opts>) {
    if (this.isPersistent(params)) {
      this.server = await startServer({ log: params.footerLog })
    }
  }

  terminate() {
    this.garden?.events.emit("_exit", {})
  }

  async action({ garden, log, footerLog, args, opts }: CommandParams<Args, Opts>) {
    this.garden = garden

    if (this.server) {
      this.server.setGarden(garden)
    }

    // if (opts.interactive && opts.watch) {
    //   throw new ParameterError(`The --interactive/-i option cannot be used with the --watch/-w flag.`, {
    //     args,
    //     opts,
    //   })
    // }

    const graph = await garden.getConfigGraph({ log, emit: true })

    let includeNames: string[] | undefined = undefined
    const force = opts.force
    const skipRuntimeDependencies = opts["skip-dependencies"]

    if (args.names && args.names.length > 0) {
      includeNames = args.names
    }

    if (!includeNames && !opts.module) {
      throw new ParameterError(
        `A name argument or --module must be specified. If you really want to perform every Run in the project, please specify '*' as an argument.`,
        { args, opts }
      )
    }

    let actions = graph.getActionsByKind("Run", {
      includeNames,
      moduleNames: opts.module,
      excludeNames: opts.skip,
    })

    for (const action of actions) {
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
    }

    actions = actions.filter((a) => !a.isDisabled())

    // Warn users if they seem to be using old `run <...>` commands.
    const divider = renderDivider()
    const firstArg = args.names?.[0]
    const warningKey = `run-${firstArg}-removed`

    if (firstArg === "test") {
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
    } else if (firstArg === "task") {
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
    } else if (firstArg === "module" || firstArg === "service") {
      await emitWarning({
        key: warningKey,
        log,
        message: chalk.yellowBright(
          dedent`
            ${divider}
            The ${chalk.white("garden run " + firstArg)} command has been removed.
            Please define a Run action instead, or use the underlying tools (e.g. Docker or Kubernetes) directly.
            ${divider}
          `
        ),
      })
    } else if (firstArg === "workflow") {
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

    const initialTasks = actions.map(
      (action) =>
        new RunTask({
          garden,
          graph,
          log,
          force,
          forceBuild: opts["force-build"],
          fromWatch: false,
          action,
          devModeDeployNames: [],
          localModeDeployNames: [],
          skipRuntimeDependencies,
          // interactive: opts.interactive,
        })
    )

    // if (opts.interactive && initialTasks.length !== 1) {
    //   throw new ParameterError(`The --interactive/-i option can only be used if a single Run is selected.`, {
    //     args,
    //     opts,
    //   })
    // }

    const results = await processActions({
      garden,
      graph,
      log,
      footerLog,
      actions,
      initialTasks,
      watch: opts.watch,
      changeHandler: async (updatedGraph, action) => {
        if (!isRunAction(action)) {
          return []
        }

        return [
          new RunTask({
            garden,
            graph: updatedGraph,
            log,
            force,
            forceActions: [],
            fromWatch: false,
            action,
            devModeDeployNames: [],
            skipRuntimeDependencies,
            localModeDeployNames: [],
          }),
        ]
      },
    })

    return handleProcessResults(footerLog, "test", results)
  }
}
