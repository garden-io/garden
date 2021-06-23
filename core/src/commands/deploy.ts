/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import deline = require("deline")
import dedent = require("dedent")

import {
  Command,
  CommandParams,
  CommandResult,
  handleProcessResults,
  PrepareParams,
  processCommandResultSchema,
  ProcessCommandResult,
} from "./base"
import { getModuleWatchTasks } from "../tasks/helpers"
import { processModules } from "../process"
import { printHeader } from "../logger/util"
import { BaseTask } from "../tasks/base"
import { getDevModeServiceNames, getHotReloadServiceNames, validateHotReloadServiceNames } from "./helpers"
import { startServer } from "../server/server"
import { DeployTask } from "../tasks/deploy"
import { naturalList } from "../util/string"
import chalk = require("chalk")
import { StringsParameter, BooleanParameter } from "../cli/params"
import { Garden } from "../garden"

export const deployArgs = {
  services: new StringsParameter({
    help: deline`The name(s) of the service(s) to deploy (skip to deploy all services).
      Use comma as a separator to specify multiple services.`,
  }),
}

export const deployOpts = {
  "force": new BooleanParameter({ help: "Force redeploy of service(s)." }),
  "force-build": new BooleanParameter({ help: "Force rebuild of module(s)." }),
  "watch": new BooleanParameter({
    help: "Watch for changes in module(s) and auto-deploy.",
    alias: "w",
    cliOnly: true,
  }),
  "dev-mode": new StringsParameter({
    help: deline`[EXPERIMENTAL] The name(s) of the service(s) to deploy with dev mode enabled.
      Use comma as a separator to specify multiple services. Use * to deploy all
      services with dev mode enabled. When this option is used,
      the command is run in watch mode (i.e. implicitly sets the --watch/-w flag).
    `,
    alias: "dev",
  }),
  "hot-reload": new StringsParameter({
    help: deline`The name(s) of the service(s) to deploy with hot reloading enabled.
      Use comma as a separator to specify multiple services. Use * to deploy all
      services with hot reloading enabled (ignores services belonging to modules that
      don't support or haven't configured hot reloading). When this option is used,
      the command is run in watch mode (i.e. implicitly sets the --watch/-w flag).
    `,
    alias: "hot",
  }),
  "skip": new StringsParameter({
    help: "The name(s) of services you'd like to skip when deploying.",
  }),
}

type Args = typeof deployArgs
type Opts = typeof deployOpts

export class DeployCommand extends Command<Args, Opts> {
  name = "deploy"
  help = "Deploy service(s) to your environment."

  protected = true
  workflows = true
  streamEvents = true

  description = dedent`
    Deploys all or specified services, taking into account service dependency order.
    Also builds modules and dependencies if needed.

    Optionally stays running and automatically re-builds and re-deploys services if their module source
    (or their dependencies' sources) change.

    Examples:

        garden deploy                      # deploy all modules in the project
        garden deploy my-service           # only deploy my-service
        garden deploy service-a,service-b  # only deploy service-a and service-b
        garden deploy --force              # force re-deploy of modules, even if they're already deployed
        garden deploy --watch              # watch for changes to code
        garden deploy --hot=my-service     # deploys all services, with hot reloading enabled for my-service
        garden deploy --hot=*              # deploys all compatible services with hot reloading enabled
        garden deploy --env stage          # deploy your services to an environment called stage
        garden deploy --skip service-b     # deploy all services except service-b
  `

  arguments = deployArgs
  options = deployOpts

  private garden?: Garden

  outputsSchema = () => processCommandResultSchema()

  private isPersistent = (opts) => !!opts.watch || !!opts["hot-reload"]

  printHeader({ headerLog }) {
    printHeader(headerLog, "Deploy", "rocket")
  }

  async prepare({ footerLog, opts }: PrepareParams<Args, Opts>) {
    const persistent = this.isPersistent(opts)

    if (persistent) {
      this.server = await startServer({ log: footerLog })
    }

    return { persistent }
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

    const initGraph = await garden.getConfigGraph(log)
    let services = initGraph.getServices({ names: args.services, includeDisabled: true })

    const disabled = services.filter((s) => s.disabled).map((s) => s.name)

    if (disabled.length > 0) {
      const bold = disabled.map((d) => chalk.bold(d))
      const msg = disabled.length === 1 ? `Service ${bold} is disabled` : `Services ${naturalList(bold)} are disabled`
      log.info({ symbol: "info", msg: chalk.white(msg) })
    }

    const skipped = opts.skip || []

    services = services.filter((s) => !s.disabled && !skipped.includes(s.name))

    if (services.length === 0) {
      log.error({ msg: "No services to deploy. Aborting." })
      return { result: { builds: {}, deployments: {}, tests: {}, graphResults: {} } }
    }

    const modules = Array.from(new Set(services.map((s) => s.module)))
    const devModeServiceNames = await getDevModeServiceNames(opts["dev-mode"], initGraph)
    const hotReloadServiceNames = await getHotReloadServiceNames(opts["hot-reload"], initGraph)

    let watch = opts.watch

    if (devModeServiceNames.length > 0) {
      watch = true
    }

    if (hotReloadServiceNames.length > 0) {
      initGraph.getServices({ names: hotReloadServiceNames }) // validate the existence of these services
      const errMsg = await validateHotReloadServiceNames(hotReloadServiceNames, initGraph)
      if (errMsg) {
        log.error({ msg: errMsg })
        return { result: { builds: {}, deployments: {}, tests: {}, graphResults: {} } }
      }
      watch = true
    }

    const force = opts.force
    const forceBuild = opts["force-build"]

    const initialTasks = services.map(
      (service) =>
        new DeployTask({
          garden,
          log,
          graph: initGraph,
          service,
          force,
          forceBuild,
          fromWatch: false,
          devModeServiceNames,
          hotReloadServiceNames,
        })
    )

    const results = await processModules({
      garden,
      graph: initGraph,
      log,
      footerLog,
      modules,
      initialTasks,
      watch,
      changeHandler: async (graph, module) => {
        const tasks: BaseTask[] = await getModuleWatchTasks({
          garden,
          graph,
          log,
          module,
          servicesWatched: services.map((s) => s.name),
          devModeServiceNames,
          hotReloadServiceNames,
        })

        return tasks
      },
    })

    return handleProcessResults(footerLog, "deploy", results)
  }
}
