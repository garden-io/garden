/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  BooleanParameter,
  Command,
  CommandParams,
  CommandResult,
  handleTaskResults,
  StringsParameter,
} from "./base"
import { getDeployTasks } from "../tasks/deploy"
import { TaskResults } from "../task-graph"
import { processServices } from "../process"
import { getNames } from "../util/util"

const deployArgs = {
  service: new StringsParameter({
    help: "The name of the service(s) to deploy (skip to deploy all services). " +
      "Use comma as separator to specify multiple services.",
  }),
}

const deployOpts = {
  force: new BooleanParameter({ help: "Force redeploy of service(s)." }),
  "force-build": new BooleanParameter({ help: "Force rebuild of module(s)." }),
  watch: new BooleanParameter({ help: "Watch for changes in module(s) and auto-deploy.", alias: "w" }),
}

type Args = typeof deployArgs
type Opts = typeof deployOpts

export class DeployCommand extends Command<Args, Opts> {
  name = "deploy"
  help = "Deploy service(s) to your environment."

  description = `
    Deploys all or specified services, taking into account service dependency order.
    Also builds modules and dependencies if needed.

    Optionally stays running and automatically re-builds and re-deploys services if their module source
    (or their dependencies' sources) change.

    Examples:

        garden deploy              # deploy all modules in the project
        garden deploy my-service   # only deploy my-service
        garden deploy --force      # force re-deploy of modules, even if they're already deployed
        garden deploy --watch      # watch for changes to code
        garden deploy --env stage  # deploy your services to an environment called stage
  `

  arguments = deployArgs
  options = deployOpts

  async action({ garden, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<TaskResults>> {
    const services = await garden.getServices(args.service)
    const serviceNames = getNames(services)

    if (services.length === 0) {
      garden.log.warn({ msg: "No services found. Aborting." })
      return { result: {} }
    }

    garden.log.header({ emoji: "rocket", command: "Deploy" })

    // TODO: make this a task
    await garden.actions.prepareEnvironment({})

    const results = await processServices({
      garden,
      services,
      watch: opts.watch,
      handler: async (module) => getDeployTasks({
        garden,
        module,
        serviceNames,
        force: opts.force,
        forceBuild: opts["force-build"],
        includeDependants: false,
      }),
      changeHandler: async (module) => getDeployTasks({
        garden,
        module,
        serviceNames,
        force: true,
        forceBuild: true,
        includeDependants: true,
      }),
    })

    return handleTaskResults(garden, "deploy", results)
  }
}
