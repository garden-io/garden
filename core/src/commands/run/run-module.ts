/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"

import { printHeader } from "../../logger/util"
import { dedent, deline } from "../../util/string"
import { Command, CommandParams, CommandResult, ExecActionOutput, handleExecResult } from "../base"
import { StringParameter, StringsParameter, BooleanParameter, StringOption } from "../../cli/params"
import { BuildTask } from "../../tasks/build"

const runModuleArgs = {
  name: new StringParameter({
    help: "The name of the module to run.",
    required: true,
  }),
  // TODO: make this a variadic arg
  arguments: new StringsParameter({
    help: "The arguments to run the module with. Example: 'yarn run my-script'.",
    delimiter: " ",
  }),
}

const runModuleOpts = {
  "interactive": new BooleanParameter({
    help: "Set to false to skip interactive mode and just output the command result.",
    defaultValue: false,
    cliDefault: true,
    cliOnly: true,
  }),
  "force-build": new BooleanParameter({
    help: "Force rebuild before running.",
  }),
  "command": new StringOption({
    help: deline`The base command (a.k.a. entrypoint) to run in the module. For container images, for example,
      this overrides the image's default command/entrypoint. This option may not be relevant for all types.
      Example: '/bin/sh -c'.`,
    alias: "c",
  }),
}

type Args = typeof runModuleArgs
type Opts = typeof runModuleOpts

// interface RunBuildOutput {
//   result: ExecutionResult | null
//   graphResults: GraphResultMap
// }
type RunModuleOutput = ExecActionOutput

export class RunModuleCommand extends Command<Args, Opts> {
  name = "module"
  help = "Run an ad-hoc instance of a module."
  aliases: ["module"]

  description = dedent`
    This is useful for debugging or ad-hoc experimentation with modules.

    Note: This command is deprecated, and will be removed in Garden 0.14.

    Examples:

        garden run module my-container                                   # run an ad-hoc instance of a my-container \
         container and attach to it
        garden run module my-container /bin/sh                           # run an interactive shell in a new \
         my-container container
        garden run module my-container --interactive=false /some/script  # execute a script in my-container and \
         return the output
  `

  arguments = runModuleArgs
  options = runModuleOpts

  printHeader({ headerLog, args }) {
    const msg = args.arguments
      ? `Running module ${chalk.white(args.name)} with arguments ${chalk.white(args.arguments.join(" "))}`
      : `Running module ${chalk.white(args.name)}`

    printHeader(headerLog, msg, "runner")
  }

  async action({ garden, log, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<RunModuleOutput>> {
    const graph = await garden.getConfigGraph({ log, emit: false })

    const action = graph.getBuild(args.name)
    const router = await garden.getActionRouter()

    const interactive = opts.interactive

    log.info("")

    const buildTask = new BuildTask({
      force: true,
      garden,
      graph,
      log,
      action,
      fromWatch: false,
      devModeDeployNames: [],
      localModeDeployNames: [],
    })

    const dependencyTasks = buildTask.resolveProcessDependencies()
    const { results: dependencyResults } = await garden.processTasks({
      tasks: dependencyTasks,
      log,
      throwOnError: true,
    })

    if (interactive) {
      log.root.stop()
    }

    const { executedAction } = await garden.executeAction({ log, graph, action })

    const result = await router.build.run({
      log,
      graph,
      action: executedAction,
      command: opts.command?.split(" "),
      args: args.arguments || [],
      interactive,
      timeout: interactive ? 999999 : undefined,
    })

    return handleExecResult({
      log,
      description: "run build",
      result,
      interactive,
      graphResults: dependencyResults,
    })
  }
}
