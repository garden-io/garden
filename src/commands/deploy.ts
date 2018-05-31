/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginContext } from "../plugin-context"
import { DeployTask } from "../tasks/deploy"
import {
  BooleanParameter,
  Command,
  CommandResult,
  handleTaskResults,
  ParameterValues,
  StringParameter,
} from "./base"
import { TaskResults } from "../task-graph"

export const deployArgs = {
  service: new StringParameter({
    help: "The name of the service(s) to deploy (skip to deploy all services). " +
      "Use comma as separator to specify multiple services.",
  }),
}

export const deployOpts = {
  force: new BooleanParameter({ help: "Force redeploy of service(s)." }),
  "force-build": new BooleanParameter({ help: "Force rebuild of module(s)." }),
  watch: new BooleanParameter({ help: "Watch for changes in module(s) and auto-deploy.", alias: "w" }),
}

export type Args = ParameterValues<typeof deployArgs>
export type Opts = ParameterValues<typeof deployOpts>

export class DeployCommand extends Command<typeof deployArgs, typeof deployOpts> {
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

  async action(ctx: PluginContext, args: Args, opts: Opts): Promise<CommandResult<TaskResults>> {
    const names = args.service ? args.service.split(",") : undefined
    const services = await ctx.getServices(names)

    if (services.length === 0) {
      ctx.log.warn({ msg: "No services found. Aborting." })
      return { result: {} }
    }

    ctx.log.header({ emoji: "rocket", command: "Deploy" })

    // TODO: make this a task
    await ctx.configureEnvironment({})

    const watch = opts.watch
    const force = opts.force
    const forceBuild = opts["force-build"]

    const results = await ctx.processServices({
      services,
      watch,
      process: async (service) => {
        return [await DeployTask.factory({ ctx, service, force, forceBuild })]
      },
    })

    return handleTaskResults(ctx, "deploy", results)
  }
}
