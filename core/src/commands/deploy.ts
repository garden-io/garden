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
import { getModuleWatchTasks } from "../tasks/helpers"
import { processModules } from "../process"
import { printHeader } from "../logger/util"
import { BaseTask } from "../tasks/base"
import {
  getDevModeModules,
  getMatchingServiceNames,
  getHotReloadServiceNames,
  validateHotReloadServiceNames,
} from "./helpers"
import { startServer } from "../server/server"
import { DeployTask } from "../tasks/deploy"
import { naturalList } from "../util/string"
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
    help: deline`The name(s) of the service(s) to deploy with dev mode enabled.
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
  "local-mode": new StringsParameter({
    help: deline`[EXPERIMENTAL] The name(s) of the service(s) to be started locally with local mode enabled.
    Use comma as a separator to specify multiple services. Use * to deploy all
    services with local mode enabled. When this option is used,
    the command is run in persistent mode.
    `,
    alias: "local",
  }),
  "skip": new StringsParameter({
    help: "The name(s) of services you'd like to skip when deploying.",
  }),
  "skip-dependencies": new BooleanParameter({
    help: deline`Deploy the specified services, but don't deploy any additional services that they depend on or run
    any tasks that they depend on. This option can only be used when a list of service names is passed as CLI arguments.
    This can be useful e.g. when your stack has already been deployed, and you want to deploy a subset of services in
    dev mode without redeploying any service dependencies that may have changed since you last deployed.
    `,
    alias: "no-deps",
  }),
  "forward": new BooleanParameter({
    help: deline`Create port forwards and leave process running without watching
    for changes. Ignored if --watch/-w flag is set or when in dev or hot-reload mode.`,
  }),
}

type Args = typeof deployArgs
type Opts = typeof deployOpts

export class DeployCommand extends Command<Args, Opts> {
  name = "deploy"
  help = "Deploy service(s) to your environment."

  protected = true
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
        garden deploy --dev=my-service     # deploys all services, with dev mode enabled for my-service
        garden deploy --dev                # deploys all compatible services with dev mode enabled
        garden deploy --env stage          # deploy your services to an environment called stage
        garden deploy --skip service-b     # deploy all services except service-b
  `

  arguments = deployArgs
  options = deployOpts

  private garden?: Garden

  outputsSchema = () => processCommandResultSchema()

  isPersistent({ opts }: PrepareParams<Args, Opts>) {
    return !!opts.watch || !!opts["hot-reload"] || !!opts["dev-mode"] || !!opts["local-mode"] || !!opts.forward
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

    const skipRuntimeDependencies = opts["skip-dependencies"]
    if (skipRuntimeDependencies && (!args.services || args.services.length === 0)) {
      const errMsg = deline`
        No service names were provided as CLI arguments, but the --skip-dependencies option was used. Please provide a
        list of service names when using the --skip-dependencies option.
      `
      log.error({ msg: errMsg })
      return { result: { builds: {}, deployments: {}, tests: {}, graphResults: {} } }
    }

    const modules = Array.from(new Set(services.map((s) => s.module)))
    const devModeServiceNames = getMatchingServiceNames(opts["dev-mode"], initGraph)
    const hotReloadServiceNames = getHotReloadServiceNames(opts["hot-reload"], initGraph)
    const localModeServiceNames = getMatchingServiceNames(opts["local-mode"], initGraph)

    let watch = opts.watch

    if (devModeServiceNames.length > 0) {
      watch = true
    }

    if (hotReloadServiceNames.length > 0) {
      initGraph.getServices({ names: hotReloadServiceNames }) // validate the existence of these services
      const errMsg = validateHotReloadServiceNames(hotReloadServiceNames, initGraph)
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
          skipRuntimeDependencies,
          devModeServiceNames,
          hotReloadServiceNames,
          localModeServiceNames,
        })
    )

    const results = await processModules({
      garden,
      graph: initGraph,
      log,
      footerLog,
      modules,
      initialTasks,
      skipWatchModules: getDevModeModules(devModeServiceNames, initGraph),
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
          localModeServiceNames,
        })

        return tasks
      },
    })

    return handleProcessResults(footerLog, "deploy", results)
  }
}
