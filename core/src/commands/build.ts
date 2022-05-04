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
  PrepareParams,
  ProcessCommandResult,
  processCommandResultSchema,
} from "./base"
import dedent from "dedent"
import { processActions } from "../process"
import { printHeader } from "../logger/util"
import { startServer } from "../server/server"
import { flatten } from "lodash"
import { BuildTask } from "../tasks/build"
import { StringsParameter, BooleanParameter } from "../cli/params"
import { Garden } from "../garden"
import { uniqByName } from "../util/util"
import { deline } from "../util/string"
import { isBuildAction } from "../actions/build"

const buildArgs = {
  names: new StringsParameter({
    help: "Specify builds to run. Use comma as a separator to specify multiple names.",
  }),
}

const buildOpts = {
  "force": new BooleanParameter({ help: "Force re-build.", alias: "f" }),
  "watch": new BooleanParameter({
    help: "Watch for changes and auto-build.",
    alias: "w",
    cliOnly: true,
  }),
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

        garden build            # build everything in the project
        garden build my-image   # only build my-image
        garden build --force    # force re-builds, even if builds had already been performed at current version
        garden build --watch    # watch for changes to code
  `

  arguments = buildArgs
  options = buildOpts

  private garden?: Garden

  outputsSchema = () => processCommandResultSchema()

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

  printHeader({ headerLog }) {
    printHeader(headerLog, "Build", "hammer")
  }

  async action({
    garden,
    log,
    footerLog,
    args,
    opts,
  }: CommandParams<Args, Opts>): Promise<CommandResult<ProcessCommandResult>> {
    this.garden = garden

    if (this.server) {
      this.server.setGarden(garden)
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
    const buildNames = actions.map((m) => m.name)

    const initialTasks = flatten(
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
            devModeDeployNames: [],
            localModeDeployNames: [],
            fromWatch: false,
          })
      )
    )

    const results = await processActions({
      garden,
      graph,
      log,
      footerLog,
      actions,
      watch: opts.watch,
      initialTasks,
      changeHandler: async (newGraph, updatedAction) => {
        const deps = newGraph.getDependants({ kind: "Build", name: updatedAction.name, recursive: true })
        const tasks = deps
          .filter(isBuildAction)
          .filter((a) => buildNames.includes(a.name))
          .map(
            (action) =>
              new BuildTask({
                garden,
                graph,
                log,
                action,
                force: true,
                forceActions: [],
                devModeDeployNames: [],
                localModeDeployNames: [],
                fromWatch: true,
              })
          )
        return flatten(await Promise.all(tasks))
      },
    })

    return handleProcessResults(footerLog, "build", results)
  }
}
