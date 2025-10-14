/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CommandParams, CommandResult, PrepareParams, ProcessCommandResult } from "./base.js"
import { Command, handleProcessResults, processCommandResultSchema } from "./base.js"
import { RunTask } from "../tasks/run.js"
import { printHeader } from "../logger/util.js"
import { ParameterError } from "../exceptions.js"
import { dedent, deline } from "../util/string.js"
import { BooleanParameter, StringsParameter } from "../cli/params.js"
import { validateActionSearchResults } from "./helpers.js"
import type { Log } from "../logger/log-entry.js"
import { TestCommand } from "./test.js"
import type { WorkflowRunOutput } from "./workflow.js"
import { WorkflowCommand } from "./workflow.js"
import { watchParameter, watchRemovedWarning } from "./util/watch-parameter.js"
import { styles } from "../logger/styles.js"

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
    aliases: ["f"],
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

  override streamEvents = true
  override protected = true

  override description = dedent`
    This is useful for any ad-hoc Runs, for example database migrations, or when developing.

    Examples:

        garden run my-db-migration   # run my-db-migration
        garden run my-run -l 3       # run with verbose log level to see the live log output
  `

  override arguments = runArgs
  override options = runOpts

  override outputsSchema = () => processCommandResultSchema()

  override printHeader({ log }: PrepareParams<Args, Opts>) {
    const msg = `Run`
    printHeader(log, msg, "🏃‍♂️")
  }

  async action(
    params: CommandParams<Args, Opts>
  ): Promise<CommandResult<ProcessCommandResult> | CommandResult<WorkflowRunOutput>> {
    const { garden, log, args, opts } = params

    // Detect possible old-style invocations as early as possible
    // Needs to be done before graph init to support lazy init usecases, e.g. workflows
    let names: string[] | undefined = undefined
    if (args.names && args.names.length > 0) {
      names = args.names as string[]
      const result = await maybeOldRunCommand(names, args, opts, log, params)
      // If we get a result from the old-style compatibility runner, early return it instead of continuing
      if (result) {
        return result
      }
    }

    if (opts.watch) {
      await watchRemovedWarning(garden, log)
    }

    let actionsFilter: string[] | undefined = undefined

    // TODO: Optimize partial module resolution further when --skip-dependencies=true
    // TODO: Optimize partial resolution further with --skip flag
    if (args.names) {
      actionsFilter = args.names.map((name) => `run.${name}`)
    }

    const graph = await garden.getConfigGraph({ log, emit: true, actionsFilter })

    const force = opts.force
    const skipRuntimeDependencies = opts["skip-dependencies"]

    if (!names && !opts.module) {
      throw new ParameterError({
        message: `A name argument or --module must be specified. If you really want to perform every Run in the project, please specify '*' as an argument.`,
      })
    }

    // Validate module names if specified.
    if (opts.module) {
      graph.getModules({ names: opts.module })
    }

    const allActions = graph.getActionsByKind("Run", {
      excludeNames: opts.skip,
      includeDisabled: true,
    })

    let actions = graph.getActionsByKind("Run", {
      includeNames: names,
      moduleNames: opts.module,
      excludeNames: opts.skip,
      includeDisabled: true,
    })

    const { shouldAbort } = validateActionSearchResults({
      log,
      actionKind: "Run",
      actions,
      allActions,
      names,
    })
    if (shouldAbort) {
      return {}
    }

    for (const action of actions) {
      if (action.isDisabled() && !opts.force) {
        log.warn(
          deline`
            ${styles.error(action.longDescription())} is disabled for the ${styles.error(garden.environmentName)}
            environment. If you're sure you want to run it anyway, please run the command again with the
            ${styles.error("--force")} flag.
          `
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

    const results = await garden.processTasks({ tasks, logProgressStatus: true })

    return handleProcessResults(garden, log, "run", results)
  }
}

/**
 * Helper function for detecting an old-style run command invocation and passing the params to the correct handlers. Examples: `garden run workflow foo`, `garden run test`.
 *
 * This is slightly hacky with any types and other parameter adjusting, but is required for backwards compatibility.
 */
function maybeOldRunCommand(names: string[], args: any, opts: any, log: Log, params: any) {
  const firstArg = names[0]
  if (["module", "service", "task", "test", "workflow"].includes(firstArg)) {
    if (firstArg === "module" || firstArg === "service") {
      throw new ParameterError({
        message: `Error: The ${styles.accent("garden run " + firstArg)} command has been removed.
      Please define a Run action instead, or use the underlying tools (e.g. Docker or Kubernetes) directly.`,
      })
    }
    if (firstArg === "task") {
      log.warn(
        `The ${styles.command("run task")} command will be removed in Garden 0.14. Please use the ${styles.command(
          "run"
        )} command instead.`
      )
      // Remove the `task` arg and continue execution in the Run handler
      names.shift()
      return
    }
    if (firstArg === "test") {
      log.warn(
        `The ${styles.command("run test")} command will be removed in Garden 0.14. Please use the ${styles.command(
          "test"
        )} command instead.`
      )
      // Remove the `test` arg and execute in the Test handler
      names.shift()
      const testCmd = new TestCommand()
      return testCmd.action(params)
    }
    if (firstArg === "workflow") {
      log.warn(
        `The ${styles.command("run workflow")} command will be removed in Garden 0.14. Please use the ${styles.command(
          "workflow"
        )} command instead.`
      )
      // Remove the `workflow` arg and execute in the Workflow handler
      names.shift()
      const workflowCmd = new WorkflowCommand()
      const workflow = names[0] // NOTE: the workflow command only supports passing one workflow name, not a list
      return workflowCmd.action({ ...params, args: { ...args, workflow } })
    }
  }
  return
}
