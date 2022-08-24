/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import deline = require("deline")
import dedent = require("dedent")
import chalk = require("chalk")

import {
  Command,
  CommandParams,
  CommandResult,
  handleProcessResults,
  PrepareParams,
  processCommandResultSchema,
  ProcessCommandResult,
} from "./base"
import { getActionWatchTasks } from "../tasks/helpers"
import { processActions } from "../process"
import { printHeader } from "../logger/util"
import { BaseTask } from "../tasks/base"
import { getMatchingServiceNames } from "./helpers"
import { startServer } from "../server/server"
import { DeployTask } from "../tasks/deploy"
import { naturalList } from "../util/string"
import { StringsParameter, BooleanParameter } from "../cli/params"
import { Garden } from "../garden"

export const deployArgs = {
  names: new StringsParameter({
    help: deline`The name(s) of the deploy(s) (or services if using modules) to deploy (skip to deploy everything).
      Use comma as a separator to specify multiple names.`,
  }),
}

export const deployOpts = {
  "force": new BooleanParameter({ help: "Force re-deploy." }),
  "force-build": new BooleanParameter({ help: "Force re-build of build dependencies." }),
  "watch": new BooleanParameter({
    help: "Watch for changes and auto-deploy.",
    alias: "w",
    cliOnly: true,
  }),
  "dev-mode": new StringsParameter({
    help: deline`The name(s) of the deploys to deploy with dev mode enabled.
      Use comma as a separator to specify multiple names. Use * to deploy all
      with dev mode enabled. Implicitly sets the --watch/-w flag.
    `,
    alias: "dev",
  }),
  "local-mode": new StringsParameter({
    help: deline`[EXPERIMENTAL] The name(s) of the service(s) to be started locally with local mode enabled.
    Use comma as a separator to specify multiple services. Use * to deploy all
    services with local mode enabled. When this option is used,
    the command is run in persistent mode.

    This always takes the precedence over the dev mode if there are any conflicts,
    i.e. if the same services are passed to both \`--dev\` and \`--local\` options.
    `,
    alias: "local",
  }),
  "skip": new StringsParameter({
    help: "The name(s) of deploys you'd like to skip.",
  }),
  "skip-dependencies": new BooleanParameter({
    help: deline`
    Deploy the specified actions, but don't build, deploy or run any dependencies. This option can only be used when a list of names is passed as CLI arguments.
    This can be useful e.g. when your stack has already been deployed, and you want to run specific deploys in dev mode without building, deploying or running dependencies that may have changed since you last deployed.
    `,
    alias: "no-deps",
  }),
  "forward": new BooleanParameter({
    help: deline`Create port forwards and leave process running without watching
    for changes. Ignored if --watch/-w flag is set or when in dev mode.`,
  }),
}

type Args = typeof deployArgs
type Opts = typeof deployOpts

export class DeployCommand extends Command<Args, Opts> {
  name = "deploy"
  help = "Deploy actions to your environment."

  protected = true
  streamEvents = true

  description = dedent`
    Deploys all or specified Deploy actions , taking into account dependency order.
    Also performs builds and other dependencies if needed.

    Optionally stays running and automatically re-builds and re-deploys if sources
    (or dependencies' sources) change.

    Examples:

        garden deploy                      # deploy everything in the project
        garden deploy my-service           # only deploy my-service
        garden deploy service-a,service-b  # only deploy service-a and service-b
        garden deploy --force              # force re-deploy, even for deploys already deployed and up-to-date
        garden deploy --watch              # watch for changes to code
        garden deploy --dev=my-service     # deploys everything with dev mode enabled for my-service
        garden deploy --dev                # deploys everything, enabling dev mode on all applicable actions
        garden deploy --local=my-service   # deploys everything with local mode enabled for my-service
        garden deploy --local              # deploys everything, enabling local mode on all applicable actions
        garden deploy --env stage          # deploy to an environment called stage
        garden deploy --skip service-b     # deploy everything except service-b
  `

  arguments = deployArgs
  options = deployOpts

  private garden?: Garden

  outputsSchema = () => processCommandResultSchema()

  isPersistent({ opts }: PrepareParams<Args, Opts>) {
    return !!opts.watch || !!opts["dev-mode"] || !!opts["local-mode"] || !!opts.forward
  }

  printHeader({ headerLog }) {
    printHeader(headerLog, "Deploy", "rocket")
  }

  async prepare(params: PrepareParams<Args, Opts>) {
    if (this.isPersistent(params)) {
      this.server = await startServer({ log: params.footerLog })
    }
  }

  terminate() {
    this.garden?.events.emit("_exit", {})
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

    const initGraph = await garden.getConfigGraph({ log, emit: true })
    let actions = initGraph.getDeploys({ names: args.names, includeDisabled: true })

    const disabled = actions.filter((s) => s.isDisabled()).map((s) => s.name)

    if (disabled.length > 0) {
      const bold = disabled.map((d) => chalk.bold(d))
      const msg = disabled.length === 1 ? `Service ${bold} is disabled` : `Services ${naturalList(bold)} are disabled`
      log.info({ symbol: "info", msg: chalk.white(msg) })
    }

    const skipped = opts.skip || []

    actions = actions.filter((s) => !s.isDisabled() && !skipped.includes(s.name))

    if (actions.length === 0) {
      log.error({ msg: "No services to deploy. Aborting." })
      return { result: { aborted: true, success: true, graphResults: {} } }
    }

    const skipRuntimeDependencies = opts["skip-dependencies"]
    if (skipRuntimeDependencies && (!args.names || args.names.length === 0)) {
      const errMsg = deline`
        No names were provided as CLI arguments, but the --skip-dependencies option was used. Please provide a
        list of names when using the --skip-dependencies option.
      `
      log.error({ msg: errMsg })
      return { result: { aborted: true, success: false, graphResults: {} } }
    }

    const localModeDeployNames = getMatchingServiceNames(opts["local-mode"], initGraph)
    const devModeDeployNames = getMatchingServiceNames(opts["dev-mode"], initGraph).filter(
      (name) => !localModeDeployNames.includes(name)
    )

    let watch = opts.watch

    if (devModeDeployNames.length > 0) {
      watch = true
    }

    const force = opts.force

    const initialTasks = actions.map(
      (action) =>
        new DeployTask({
          garden,
          log,
          graph: initGraph,
          action,
          force,
          forceBuild: opts["force-build"],
          fromWatch: false,
          skipRuntimeDependencies,
          localModeDeployNames,
          devModeDeployNames,
        })
    )

    const results = await processActions({
      garden,
      graph: initGraph,
      log,
      footerLog,
      actions,
      initialTasks,
      skipWatch: [
        // TODO-G2: include skipRuntimeDependencies here
        ...initGraph.getDeploys({ names: devModeDeployNames }),
        ...initGraph.getDeploys({ names: localModeDeployNames }),
      ],
      watch,
      changeHandler: async (graph, updatedAction) => {
        const tasks: BaseTask[] = await getActionWatchTasks({
          garden,
          graph,
          log,
          updatedAction,
          deploysWatched: actions.map((s) => s.name),
          localModeDeployNames,
          devModeDeployNames,
          testsWatched: [],
        })

        return tasks
      },
    })

    return handleProcessResults(footerLog, "deploy", results)
  }
}
