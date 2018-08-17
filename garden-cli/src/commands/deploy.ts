/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird = require("bluebird")
import { flatten } from "lodash"
import {
  BooleanParameter,
  Command,
  CommandParams,
  CommandResult,
  handleTaskResults,
  ParameterValues,
  StringsParameter,
} from "./base"
import { DeployTask } from "../tasks/deploy"
import { TaskResults } from "../task-graph"
import { processServices } from "../process"
import { getNames } from "../util/util"
import { PluginContext } from "../plugin-context"
import { Module } from "../types/module"
import { computeAutoReloadDependants, withDependants } from "../watch"

export const deployArgs = {
  service: new StringsParameter({
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

  async action({ garden, ctx, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<TaskResults>> {

    const services = await ctx.getServices(args.service)
    const serviceNames = getNames(services)

    if (services.length === 0) {
      ctx.log.warn({ msg: "No services found. Aborting." })
      return { result: {} }
    }

    ctx.log.header({ emoji: "rocket", command: "Deploy" })

    // TODO: make this a task
    await ctx.configureEnvironment({})

    const results = await processServices({
      ctx,
      garden,
      services,
      watch: opts.watch,
      process: async (module) => getDeployTasks({
        ctx, module, serviceNames, force: opts.force, forceBuild: opts["force-build"], includeDependants: false}),
      processWatchChange: async (module) => getDeployTasks({
        ctx, module, serviceNames, force: true, forceBuild: true, includeDependants: true}),
    })

    return handleTaskResults(ctx, "deploy", results)
  }
}

export async function getDeployTasks(
  { ctx, module, serviceNames, force = false, forceBuild = false, includeDependants = false }:
    { ctx: PluginContext, module: Module, serviceNames?: string[] | null,
      force?: boolean, forceBuild?: boolean, includeDependants?: boolean },
) {

  const modulesToProcess = includeDependants
    ? (await withDependants(ctx, [module], await computeAutoReloadDependants(ctx)))
    : [module]

  const moduleServices = flatten(await Bluebird.map(
    modulesToProcess,
    m => ctx.getServices(getNames(m.serviceConfigs))))

  const servicesToProcess = serviceNames
    ? moduleServices.filter(s => serviceNames.includes(s.name))
    : moduleServices

  return servicesToProcess.map(service => new DeployTask({ ctx, service, force, forceBuild }))

}
