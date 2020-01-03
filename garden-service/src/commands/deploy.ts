/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import deline = require("deline")
import dedent = require("dedent")

import {
  BooleanParameter,
  Command,
  CommandParams,
  CommandResult,
  handleTaskResults,
  StringsParameter,
  PrepareParams,
} from "./base"
import { getModuleWatchTasks } from "../tasks/helpers"
import { TaskResults } from "../task-graph"
import { processModules } from "../process"
import { printHeader } from "../logger/util"
import { BaseTask } from "../tasks/base"
import { getHotReloadServiceNames, validateHotReloadServiceNames } from "./helpers"
import { startServer, GardenServer } from "../server/server"
import { DeployTask } from "../tasks/deploy"
import { naturalList } from "../util/string"

const deployArgs = {
  services: new StringsParameter({
    help: deline`The name(s) of the service(s) to deploy (skip to deploy all services).
      Use comma as a separator to specify multiple services.`,
  }),
}

const deployOpts = {
  "force": new BooleanParameter({ help: "Force redeploy of service(s)." }),
  "force-build": new BooleanParameter({ help: "Force rebuild of module(s)." }),
  "watch": new BooleanParameter({
    help: "Watch for changes in module(s) and auto-deploy.",
    alias: "w",
    cliOnly: true,
  }),
  "hot-reload": new StringsParameter({
    help: deline`The name(s) of the service(s) to deploy with hot reloading enabled.
      Use comma as a separator to specify multiple services. Use * to deploy all
      services with hot reloading enabled (ignores services belonging to modules that
      don't support or haven't configured hot reloading). When this option is used,
      the command is run in watch mode (i.e. implicitly assumes the --watch/-w flag).
    `,
    alias: "hot",
  }),
}

type Args = typeof deployArgs
type Opts = typeof deployOpts

export class DeployCommand extends Command<Args, Opts> {
  name = "deploy"
  help = "Deploy service(s) to your environment."
  protected = true

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
  `

  arguments = deployArgs
  options = deployOpts

  private server: GardenServer

  async prepare({ headerLog, footerLog, opts }: PrepareParams<Args, Opts>) {
    printHeader(headerLog, "Deploy", "rocket")

    const persistent = !!opts.watch || !!opts["hot-reload"]

    if (persistent) {
      this.server = await startServer(footerLog)
    }

    return { persistent }
  }

  async action({ garden, log, footerLog, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<TaskResults>> {
    if (this.server) {
      this.server.setGarden(garden)
    }

    const initGraph = await garden.getConfigGraph(log)
    let services = await initGraph.getServices({ names: args.services, includeDisabled: true })

    const disabled = services.filter((s) => s.disabled).map((s) => s.name)

    if (disabled.length > 0) {
      log.info({ symbol: "info", msg: `Services ${naturalList(disabled)} are disabled` })
    }

    services = services.filter((s) => !s.disabled)
    const serviceNames = services.map((s) => s.name)

    if (services.length === 0) {
      log.error({ msg: "No services to deploy. Aborting." })
      return { result: {} }
    }

    const modules = Array.from(new Set(services.map((s) => s.module)))
    const hotReloadServiceNames = await getHotReloadServiceNames(opts["hot-reload"], initGraph)
    let watch: boolean

    if (hotReloadServiceNames.length > 0) {
      await initGraph.getServices({ names: hotReloadServiceNames }) // validate the existence of these services
      const errMsg = await validateHotReloadServiceNames(hotReloadServiceNames, initGraph)
      if (errMsg) {
        log.error({ msg: errMsg })
        return { result: {} }
      }
      watch = true
    } else {
      watch = opts.watch
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
          serviceNames: module.serviceNames.filter((name) => serviceNames.includes(name)),
          hotReloadServiceNames,
        })

        return tasks
      },
    })

    return handleTaskResults(footerLog, "deploy", results)
  }
}
