/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CommandParams, CommandResult, PrepareParams, ProcessCommandResult } from "./base.js"
import { Command, handleProcessResults, processCommandResultSchema } from "./base.js"
import { TestTask } from "../tasks/test.js"
import { printHeader } from "../logger/util.js"
import { StringsParameter, BooleanParameter } from "../cli/params.js"
import { dedent, deline } from "../util/string.js"
import { ParameterError } from "../exceptions.js"
import { warnOnLinkedActions } from "../actions/helpers.js"
import { validateActionSearchResults } from "./helpers.js"
import { watchParameter, watchRemovedWarning } from "./util/watch-parameter.js"

export const testArgs = {
  names: new StringsParameter({
    help: deline`
      The name(s) of the Test action(s) to test (skip to run all tests in the project).
      You may specify multiple test names, separated by spaces.
      Accepts glob patterns (e.g. integ* would run both 'integ' and 'integration').
    `,
    spread: true,
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.actionConfigs.Test)
    },
  }),
}

export const testOpts = {
  // TODO-0.15: remove it?
  "name": new StringsParameter({
    help: deline`
      DEPRECATED: This option will be removed in 0.14. Please use a positional argument "<module name>-<test name>" or "*-<test name>" instead of of "--name".

      This option can be used to run all tests with the specified name (e.g. unit or integ) in declared in any module.

      Note: Since 0.13, using the --name option is equivalent to using the positional argument "*-<test name>". This means that new tests declared using the new Action kinds will also be executed if their name matches this pattern.

      Accepts glob patterns (e.g. integ* would run both 'integ' and 'integration').
    `,
    aliases: ["n"],
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.actionConfigs.Test)
    },
  }),
  "force": new BooleanParameter({
    help: "Force re-run of Test, even if a successful result is found in cache.",
    aliases: ["f"],
  }),
  "force-build": new BooleanParameter({ help: "Force rebuild of any Build dependencies encountered." }),
  "interactive": new BooleanParameter({
    help: "Run the specified Test in interactive mode (i.e. to allow attaching to a shell). A single test must be selected, otherwise an error is thrown.",
    aliases: ["i"],
    cliOnly: true,
  }),
  "module": new StringsParameter({
    help: deline`
      The name(s) of one or modules to run tests from. If both this and test names are specified, the test names filter the tests found in the specified modules.
    `,
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.moduleConfigs)
    },
  }),
  "watch": watchParameter,
  "skip": new StringsParameter({
    help: deline`
      The name(s) of tests you'd like to skip. Accepts glob patterns
      (e.g. integ* would skip both 'integ' and 'integration'). Applied after the 'name' filter.
    `,
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.actionConfigs.Test)
    },
  }),
  "skip-dependencies": new BooleanParameter({
    help: deline`Don't deploy any Deploys (or services if using modules) or run any Run actions (or tasks if using modules) that the requested tests depend on.
    This can be useful e.g. when your stack has already been deployed, and you want to run Tests with runtime
    dependencies without redeploying any Deploy (or service) dependencies that may have changed since you last deployed.
    Warning: Take great care when using this option in CI, since Garden won't ensure that the runtime dependencies of
    your test suites are up to date when this option is used.`,
    aliases: ["nodeps"],
  }),
  "skip-dependants": new BooleanParameter({
    help: "DEPRECATED: This is a no-op, dependants are not processed by default anymore.",
    hidden: true,
  }),
}

type Args = typeof testArgs
type Opts = typeof testOpts

export class TestCommand extends Command<Args, Opts> {
  name = "test"
  help = "Run all or specified Test actions in the project."

  override protected = true
  override streamEvents = true

  override description = dedent`
    Runs all or specified Tests defined in the project. Also run builds and other dependencies,
    including Deploys if needed.

    Examples:

        garden test                     # run all Tests in the project
        garden test my-test             # run the my-test Test action
        garden test --module my-module  # run all Tests in the my-module module
        garden test *integ*             # run all Tests with a name containing 'integ'
        garden test *unit,*lint         # run all Tests ending with either 'unit' or 'lint' in the project
        garden test --force             # force Tests to be re-run, even if they've already run successfully
        garden test -l 3                # run with verbose log level to see the live log output
  `

  override arguments = testArgs
  override options = testOpts

  override outputsSchema = () => processCommandResultSchema()

  override printHeader({ log }) {
    printHeader(log, `Running Tests`, "🌡️")
  }

  override maybePersistent({ opts }: PrepareParams<Args, Opts>) {
    return opts.interactive
  }

  override allowInDevCommand({ opts }: PrepareParams<Args, Opts>) {
    return !opts.interactive
  }

  async action(params: CommandParams<Args, Opts>): Promise<CommandResult<ProcessCommandResult>> {
    const { garden, log, args, opts } = params

    if (opts.watch) {
      await watchRemovedWarning(garden, log)
    }

    if (opts["skip-dependants"]) {
      log.warn("The --skip-dependants option no longer has any effect, since dependants are not processed by default.")
    }

    if (opts["name"]) {
      log.warn(
        "The --name option will be removed in 0.14. Please use a positional argument <module-name>-<test-name> instead."
      )
    }

    let actionsFilter: string[] | undefined = undefined

    // TODO: Optimize partial resolution further when --skip-dependencies=true
    // TODO: Optimize partial resolution further with --skip flag
    if (args.names) {
      actionsFilter = args.names.map((name) => `test.${name}`)
    }

    if (opts.module) {
      actionsFilter = [...(actionsFilter || []), `test.${opts.module}-*`]
    }

    const graph = await garden.getConfigGraph({ log, emit: true, actionsFilter })

    const force = opts.force
    const skipRuntimeDependencies = opts["skip-dependencies"]

    let names: string[] | undefined = undefined
    const nameArgs = [...(args.names || []), ...(opts.name || []).map((n) => `*-${n}`)]

    if (nameArgs.length > 0) {
      names = nameArgs
    }

    // Validate module names if specified.
    if (opts.module) {
      graph.getModules({ names: opts.module })
    }

    const allActions = graph.getActionsByKind("Test", {
      excludeNames: opts.skip,
    })

    const actions = graph.getActionsByKind("Test", {
      includeNames: names,
      moduleNames: opts.module,
      excludeNames: opts.skip,
    })

    await warnOnLinkedActions(garden, log, actions)

    const { shouldAbort } = validateActionSearchResults({
      log,
      actionKind: "Test",
      actions,
      allActions,
      names,
    })
    if (shouldAbort) {
      return {}
    }

    const tasks = actions.map(
      (action) =>
        new TestTask({
          garden,
          graph,
          log,
          force,
          forceBuild: opts["force-build"],
          action,
          skipRuntimeDependencies,
          interactive: opts.interactive,
        })
    )

    if (opts.interactive && tasks.length !== 1) {
      throw new ParameterError({
        message: `The --interactive/-i option can only be used if a single test is selected.`,
      })
    }

    const results = await garden.processTasks({ tasks })

    return handleProcessResults(garden, log, "test", results)
  }
}
