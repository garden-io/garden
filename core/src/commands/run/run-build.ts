/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"

import { printHeader } from "../../logger/util"
import { prepareRuntimeContext } from "../../runtime-context"
import { BuildTask } from "../../tasks/build"
import { RunResult } from "../../plugin/base"
import { dedent, deline } from "../../util/string"
import { Command, CommandParams, CommandResult, handleRunResult, ProcessResultMetadata } from "../base"
import { printRuntimeContext } from "./run"
import { GraphResults } from "../../task-graph"
import { StringParameter, StringsParameter, BooleanParameter, StringOption } from "../../cli/params"

const runBuildArgs = {
  name: new StringParameter({
    help: "The name of the Build (or module) to run.",
    required: true,
  }),
  // TODO: make this a variadic arg
  arguments: new StringsParameter({
    help: "The arguments to run the build with. Example: 'yarn run my-script'.",
    delimiter: " ",
  }),
}

const runBuildOpts = {
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
    help: deline`The base command (a.k.a. entrypoint) to run in the build. For container images, for example,
      this overrides the image's default command/entrypoint. This option may not be relevant for all types.
      Example: '/bin/sh -c'.`,
    alias: "c",
  }),
}

type Args = typeof runBuildArgs
type Opts = typeof runBuildOpts

interface RunBuildOutput {
  result: RunResult & ProcessResultMetadata
  graphResults: GraphResults
}

export class RunBuildCommand extends Command<Args, Opts> {
  name = "build"
  help = "Run an ad-hoc instance of a build."
  aliases: ["module"]

  description = dedent`
    This is useful for debugging or ad-hoc experimentation with build/modules.

    Examples:

        garden run build my-container                                   # run an ad-hoc instance of a my-container \
         container and attach to it
        garden run build my-container /bin/sh                           # run an interactive shell in a new \
         my-container container
        garden run build my-container --interactive=false /some/script  # execute a script in my-container and \
         return the output
  `

  arguments = runBuildArgs
  options = runBuildOpts

  printHeader({ headerLog, args }) {
    const msg = args.arguments
      ? `Running build ${chalk.white(args.name)} with arguments ${chalk.white(args.arguments.join(" "))}`
      : `Running build ${chalk.white(args.name)}`

    printHeader(headerLog, msg, "runner")
  }

  async action({ garden, log, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<RunBuildOutput>> {
    const graph = await garden.getConfigGraph({ log, emit: false })
    const action = graph.getBuild(args.name)

    const router = await garden.getActionRouter()

    const buildTask = new BuildTask({
      garden,
      graph,
      log,
      action,
      fromWatch: false,
      force: opts["force-build"],
      devModeDeployNames: [],
      localModeDeployNames: [],
    })
    const graphResults = await garden.processTasks([buildTask])

    const dependencies = graph.getDependencies({ kind: "build", name: args.name, recursive: false })
    const interactive = opts.interactive

    const runtimeContext = await prepareRuntimeContext({
      garden,
      graph,
      dependencies,
      version: action.versionString(),
      moduleVersion: action.versionString(),
      serviceStatuses: {},
      taskResults: {},
    })

    printRuntimeContext(log, runtimeContext)

    log.info("")

    if (interactive) {
      log.root.stop()
    }

    const result = await router.build.run({
      log,
      graph,
      action,
      command: opts.command?.split(" "),
      args: args.arguments || [],
      runtimeContext,
      interactive,
      timeout: interactive ? 999999 : undefined,
    })

    return handleRunResult({ log, description: "run build", result, interactive, graphResults, action })
  }
}
