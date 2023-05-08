/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { Command, CommandParams, handleProcessResults, PrepareParams, processCommandResultSchema } from "./base"
import { RunTask } from "../tasks/run"
import { printHeader } from "../logger/util"
import { ParameterError } from "../exceptions"
import { dedent, deline } from "../util/string"
import { BooleanParameter, StringsParameter } from "../cli/params"
import { validateActionSearchResults, watchParameter, watchRemovedWarning } from "./helpers"

// TODO: support interactive execution for a single Run (needs implementation from RunTask through plugin handlers).

const runArgs = {
  names: new StringsParameter({
    help: deline`
      The name(s) of the Run action(s) to perform.
      You may specify multiple names, separated by spaces.
      Accepts glob patterns (e.g. init* would run both 'init' and 'initialize').
    `,
    spread: true,
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.actionConfigs.Run)
    },
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
      The name(s) of one or modules to pull Runs (or tasks if using modules) from. If both this and Run names are specified, the Run names filter the tasks found in the specified modules.
    `,
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.moduleConfigs)
    },
  }),
  "watch": watchParameter,
  "skip": new StringsParameter({
    help: deline`
      The name(s) of Runs you'd like to skip. Accepts glob patterns
      (e.g. init* would skip both 'init' and 'initialize').
    `,
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.actionConfigs.Run)
    },
  }),
  "skip-dependencies": new BooleanParameter({
    help: dedent`
      Don't perform any Deploy or Run actions that the requested Runs depend on.
      This can be useful e.g. when your stack has already been deployed, and you want to run Tests with runtime
      dependencies without redeploying any Deploy (or service if using modules) dependencies that may have changed since you last deployed.

      Warning: Take great care when using this option in CI, since Garden won't ensure that the runtime dependencies of
      your test suites are up to date when this option is used.
    `,
    aliases: ["nodeps"],
  }),
}

type Args = typeof runArgs
type Opts = typeof runOpts

export class RunCommand extends Command<Args, Opts> {
  name = "run"
  help = "Perform one or more Run actions"

  streamEvents = true
  protected = true

  description = dedent`
    This is useful for any ad-hoc Runs, for example database migrations, or when developing.

    Examples:

        garden run my-db-migration   # run my-db-migration
  `

  arguments = runArgs
  options = runOpts

  outputsSchema = () => processCommandResultSchema()

  printHeader({ headerLog }: PrepareParams<Args, Opts>) {
    const msg = `Run`
    printHeader(headerLog, msg, "🏃‍♂️")
  }

  async action(params: CommandParams<Args, Opts>) {
    const { garden, log, footerLog, args, opts } = params

    // Detect possible old-style invocations as early as possible
    // Needs to be done before graph init to support lazy init usecases, e.g. workflows
    let names: string[] | undefined = undefined
    if (args.names && args.names.length > 0) {
      names = args.names
      detectOldRunCommand(names, args, opts)
    }

    if (opts.watch) {
      await watchRemovedWarning(garden, log)
    }

    const graph = await garden.getConfigGraph({ log, emit: true })

    const force = opts.force
    const skipRuntimeDependencies = opts["skip-dependencies"]

    if (!names && !opts.module) {
      throw new ParameterError(
        `A name argument or --module must be specified. If you really want to perform every Run in the project, please specify '*' as an argument.`,
        { args, opts }
      )
    }

    // Validate module names if specified.
    if (opts.module) {
      graph.getModules({ names: opts.module })
    }

    let actions = graph.getActionsByKind("Run", {
      includeNames: names,
      moduleNames: opts.module,
      excludeNames: opts.skip,
      includeDisabled: true,
    })

    const { shouldAbort } = validateActionSearchResults({
      log,
      actionKind: "Test",
      actions,
      names,
      errData: { params, args },
    })
    if (shouldAbort) {
      return {}
    }

    for (const action of actions) {
      if (action.isDisabled() && !opts.force) {
        log.warn(
          chalk.yellow(deline`
            ${chalk.redBright(action.longDescription())} is disabled for the ${chalk.redBright(garden.environmentName)}
            environment. If you're sure you want to run it anyway, please run the command again with the
            ${chalk.redBright("--force")} flag.
          `)
        )
      }
    }

    actions = actions.filter((a) => !a.isDisabled() || opts.force)

    const tasks = actions.map(
      (action) =>
        new RunTask({
          garden,
          graph,
          log,
          force,
          forceBuild: opts["force-build"],
          action,

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

    const results = await garden.processTasks({ tasks, log })

    return handleProcessResults(garden, footerLog, "test", results)
  }
}

function detectOldRunCommand(names: string[], args: any, opts: any) {
  if (["module", "service", "task", "test", "workflow"].includes(names[0])) {
    let renameDescription = ""
    const firstArg = names[0]
    if (firstArg === "module" || firstArg === "service") {
      renameDescription = `The ${chalk.white("garden run " + firstArg)} command has been removed.
      Please define a Run action instead, or use the underlying tools (e.g. Docker or Kubernetes) directly.`
    }
    if (firstArg === "task") {
      renameDescription = `The ${chalk.yellow(
        "run task"
      )} command was removed in Garden 0.13. Please use the ${chalk.yellow("run")} command instead.`
    }
    if (firstArg === "test") {
      renameDescription = `The ${chalk.yellow(
        "run test"
      )} command was removed in Garden 0.13. Please use the ${chalk.yellow("test")} command instead.`
    }
    if (firstArg === "workflow") {
      renameDescription = `The ${chalk.yellow(
        "run workflow"
      )} command was removed in Garden 0.13. Please use the ${chalk.yellow("workflow")} command instead.`
    }
    throw new ParameterError(`Error: ${renameDescription}`, { args, opts })
  }
}
