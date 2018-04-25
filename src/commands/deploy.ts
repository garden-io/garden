/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginContext } from "../plugin-context"
import { DeployTask } from "../tasks/deploy"
import { BooleanParameter, Command, ParameterValues, StringParameter } from "./base"
import { TaskResults } from "../task-graph"
import { values } from "lodash"

export const deployArgs = {
  service: new StringParameter({
    help: "The name of the service(s) to deploy (skip to deploy all services). " +
      "Use comma as separator to specify multiple services.",
  }),
}

export const deployOpts = {
  force: new BooleanParameter({ help: "Force redeploy of service(s)" }),
  "force-build": new BooleanParameter({ help: "Force rebuild of module(s)" }),
  watch: new BooleanParameter({ help: "Watch for changes in module(s) and auto-deploy", alias: "w" }),
}

export type Args = ParameterValues<typeof deployArgs>
export type Opts = ParameterValues<typeof deployOpts>

export class DeployCommand extends Command<typeof deployArgs, typeof deployOpts> {
  name = "deploy"
  help = "Deploy service(s) to the specified environment"

  arguments = deployArgs
  options = deployOpts

  async action(ctx: PluginContext, args: Args, opts: Opts): Promise<TaskResults> {
    const names = args.service ? args.service.split(",") : undefined
    const services = await ctx.getServices(names)

    if (Object.keys(services).length === 0) {
      ctx.log.warn({ msg: "No services found. Aborting." })
      return {}
    }

    ctx.log.header({ emoji: "rocket", command: "Deploy" })

    // TODO: make this a task
    await ctx.configureEnvironment()

    const watch = opts.watch
    const force = opts.force
    const forceBuild = opts["force-build"]

    const modules = Array.from(new Set(values(services).map(s => s.module)))

    const result = await ctx.processModules(modules, watch, async (module) => {
      const servicesToDeploy = values(await module.getServices()).filter(s => !!services[s.name])
      for (const service of servicesToDeploy) {
        await ctx.addTask(new DeployTask(ctx, service, force, forceBuild))
      }
    })

    ctx.log.info("")
    ctx.log.header({ emoji: "heavy_check_mark", command: `Done!` })

    return result
  }
}
