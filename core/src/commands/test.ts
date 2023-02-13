/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  Command,
  CommandParams,
  CommandResult,
  handleProcessResults,
  PrepareParams,
  ProcessCommandResult,
  processCommandResultSchema,
} from "./base"
import { processActions } from "../process"
import { TestTask } from "../tasks/test"
import { printHeader } from "../logger/util"
import { StringsParameter, BooleanParameter } from "../cli/params"
import { dedent, deline } from "../util/string"
import { ParameterError } from "../exceptions"
import { watchParameter, watchRemovedWarning } from "./helpers"

export const testArgs = {
  names: new StringsParameter({
    help: deline`
      The name(s) of the Test action(s) to test (skip to run all tests in the project).
      Use comma as a separator to specify multiple tests.
      Accepts glob patterns (e.g. integ* would run both 'integ' and 'integration').
    `,
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.actionConfigs.Test)
    },
  }),
}

export const testOpts = {
  "name": new StringsParameter({
    help: deline`
      DEPRECATED: This now does the exact same as the positional arguments.

      Only run tests with the specfied name (e.g. unit or integ).
      Accepts glob patterns (e.g. integ* would run both 'integ' and 'integration').
    `,
    alias: "n",
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.actionConfigs.Test)
    },
  }),
  "force": new BooleanParameter({
    help: "Force re-run of Test, even if a successful result is found in cache.",
    alias: "f",
  }),
  "force-build": new BooleanParameter({ help: "Force rebuild of any Build dependencies encountered." }),
  "interactive": new BooleanParameter({
    help:
      "Run the specified test in interactive mode (i.e. to allow attaching to a shell). A single test must be selected, otherwise an error is thrown.",
    alias: "i",
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
    help: deline`Don't deploy any services or run any tasks that the requested tests depend on.
    This can be useful e.g. when your stack has already been deployed, and you want to run tests with runtime
    dependencies without redeploying any service dependencies that may have changed since you last deployed.
    Warning: Take great care when using this option in CI, since Garden won't ensure that the runtime dependencies of
    your test suites are up to date when this option is used.`,
    alias: "nodeps",
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

  protected = true
  streamEvents = true

  description = dedent`
    Runs all or specified tests defined in the project. Also run builds and other dependencies,
    including deploys if needed.

    Examples:

        garden test                     # run all tests in the project
        garden test my-test             # run the my-test Test action
        garden test --module my-module  # run all Tests in the my-module module
        garden test *integ*             # run all Tests with a name containing 'integ'
        garden test *unit,*lint         # run all Tests ending with either 'unit' or 'lint' in the project
        garden test --force             # force Tests to be re-run, even if they've already run successfully
  `

  arguments = testArgs
  options = testOpts

  outputsSchema = () => processCommandResultSchema()

  printHeader({ headerLog }) {
    printHeader(headerLog, `Running Tests`, "thermometer")
  }

  isPersistent({ opts }: PrepareParams<Args, Opts>) {
    return opts.interactive
  }

  async action(params: CommandParams<Args, Opts>): Promise<CommandResult<ProcessCommandResult>> {
    const { garden, log, footerLog, args, opts } = params

    if (opts.watch) {
      await watchRemovedWarning(garden, log)
    }

    const graph = await garden.getConfigGraph({ log, emit: true })

    let includeNames: string[] | undefined = undefined
    const nameArgs = [...(args.names || []), ...(opts.name || [])]
    const force = opts.force
    const skipRuntimeDependencies = opts["skip-dependencies"]

    if (nameArgs.length > 0) {
      includeNames = nameArgs
    }

    // Validate module names if specified.
    if (opts.module) {
      graph.getModules({ names: opts.module })
    }

    const actions = graph.getActionsByKind("Test", {
      includeNames,
      moduleNames: opts.module,
      excludeNames: opts.skip,
    })

    const initialTasks = actions.map(
      (action) =>
        new TestTask({
          garden,
          graph,
          log,
          force,
          forceBuild: opts["force-build"],
          action,
          devModeDeployNames: [],
          localModeDeployNames: [],
          skipRuntimeDependencies,
          interactive: opts.interactive,
        })
    )

    if (opts.interactive && initialTasks.length !== 1) {
      throw new ParameterError(`The --interactive/-i option can only be used if a single test is selected.`, {
        args,
        opts,
      })
    }

    const results = await processActions({
      garden,
      graph,
      log,
      actions,
      initialTasks,
      persistent: false,
    })

    return handleProcessResults(footerLog, "test", results)
  }
}
