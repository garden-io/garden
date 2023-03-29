/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import {
  Command,
  CommandResult,
  CommandParams,
  handleProcessResults,
  ProcessCommandResult,
  processCommandResultSchema,
} from "./base"
import dedent from "dedent"
import { printHeader } from "../logger/util"
import { flatten } from "lodash"
import { BuildTask } from "../tasks/build"
import { StringsParameter, BooleanParameter } from "../cli/params"
import { uniqByName } from "../util/util"
import { deline } from "../util/string"
import { isBuildAction } from "../actions/build"
import { watchParameter, watchRemovedWarning } from "./helpers"

const buildArgs = {
  names: new StringsParameter({
    help: "Specify builds to run. You may specify multiple names, separated by spaces.",
    spread: true,
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.actionConfigs.Build)
    },
  }),
}

const buildOpts = {
  "force": new BooleanParameter({ help: "Force re-build.", aliases: ["f"] }),
  "watch": watchParameter,
  "with-dependants": new BooleanParameter({
    help: deline`
      Also rebuild any builds that depend on one of the builds specified as CLI arguments (recursively).
      Note: This option has no effect unless a list of build names is specified as CLI arguments (since otherwise, every
      build in the project will be performed anyway).
  `,
  }),
}

type Args = typeof buildArgs
type Opts = typeof buildOpts

export class BuildCommand extends Command<Args, Opts> {
  name = "build"
  help = "Perform your Builds."

  protected = true
  streamEvents = true

  description = dedent`
    Runs all or specified Builds, taking into account build dependency order.
    Optionally stays running and automatically builds when sources (or dependencies' sources) change.

    Examples:

        garden build                   # build everything in the project
        garden build my-image          # only build my-image
        garden build image-a image-b   # build image-a and image-b
        garden build --force    # force re-builds, even if builds had already been performed at current version
  `

  arguments = buildArgs
  options = buildOpts

  outputsSchema = () => processCommandResultSchema()

  printHeader({ headerLog }) {
    printHeader(headerLog, "Build", "🔨")
  }

  async action(params: CommandParams<Args, Opts>): Promise<CommandResult<ProcessCommandResult>> {
    const { garden, log, footerLog, args, opts } = params

    if (opts.watch) {
      await watchRemovedWarning(garden, log)
    }

    await garden.clearBuilds()

    const graph = await garden.getConfigGraph({ log, emit: true })
    let actions = graph.getBuilds({ names: args.names })

    if (opts["with-dependants"]) {
      // Then we include build dependants (recursively) in the list of modules to build.
      actions = uniqByName([
        ...actions,
        ...flatten(
          actions.map((m) =>
            graph.getDependants({ kind: "Build", name: m.name, recursive: true }).filter(isBuildAction)
          )
        ),
      ])
    }

    const tasks = flatten(
      await Bluebird.map(
        actions,
        (action) =>
          new BuildTask({
            garden,
            graph,
            log,
            action,
            force: opts.force,
            forceActions: [],
          })
      )
    )

    const result = await garden.processTasks({ tasks, log })

    return handleProcessResults(garden, footerLog, "build", result)
  }
}
