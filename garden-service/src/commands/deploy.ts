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
} from "./base"
import { hotReloadAndLog, validateHotReloadOpt } from "./helpers"
import { getTasksForModule, getHotReloadModuleNames } from "../tasks/helpers"
import { TaskResults } from "../task-graph"
import { processServices } from "../process"
import { logHeader } from "../logger/util"

const deployArgs = {
  service: new StringsParameter({
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
      Use comma as a separator to specify multiple services. When this option is used,
      the command is run in watch mode (i.e. implicitly assumes the --watch/-w flag).
    `,
  }),
}

type Args = typeof deployArgs
type Opts = typeof deployOpts

export class DeployCommand extends Command<Args, Opts> {
  name = "deploy"
  help = "Deploy service(s) to your environment."

  description = dedent`
    Deploys all or specified services, taking into account service dependency order.
    Also builds modules and dependencies if needed.

    Optionally stays running and automatically re-builds and re-deploys services if their module source
    (or their dependencies' sources) change.

    Examples:

        garden deploy                         # deploy all modules in the project
        garden deploy my-service              # only deploy my-service
        garden deploy --force                 # force re-deploy of modules, even if they're already deployed
        garden deploy --watch                 # watch for changes to code
        garden deploy --hot-reload=my-service # deploys all services, with hot reloading enabled for my-service
        garden deploy --env stage             # deploy your services to an environment called stage
  `

  arguments = deployArgs
  options = deployOpts

  async printHeader(log) {
    logHeader({ log, emoji: "rocket", command: "Deploy" })
  }

  async action({ garden, log, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<TaskResults>> {
    const services = await garden.getServices(args.service)

    if (services.length === 0) {
      log.error({ msg: "No services found. Aborting." })
      return { result: {} }
    }

    let watch
    const hotReloadServiceNames = opts["hot-reload"] || []
    const hotReloadModuleNames = await getHotReloadModuleNames(garden, hotReloadServiceNames)

    if (opts["hot-reload"]) {
      if (!validateHotReloadOpt(garden, log, hotReloadServiceNames)) {
        return { result: {} }
      }
      watch = true
    } else {
      watch = opts.watch
    }

    // TODO: make this a task
    await garden.actions.prepareEnvironment({ log })

    const results = await processServices({
      garden,
      log,
      services,
      watch,
      handler: async (module) => getTasksForModule({
        garden,
        log,
        module,
        fromWatch: false,
        hotReloadServiceNames,
        force: opts.force,
        forceBuild: opts["force-build"],
      }),
      changeHandler: async (module) => {
        if (hotReloadModuleNames.has(module.name)) {
          await hotReloadAndLog(garden, log, module)
        }
        return getTasksForModule({
          garden, log, module, hotReloadServiceNames, force: true, forceBuild: opts["force-build"],
          fromWatch: true, includeDependants: true,
        })
      },
    })

    return handleTaskResults(log, "deploy", results)
  }
}
