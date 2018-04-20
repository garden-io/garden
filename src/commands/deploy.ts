/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginContext } from "../plugin-context"
import { DeployTask } from "../tasks/deploy"
import { watchModules } from "../watch"
import { BooleanParameter, Command, ParameterValues, StringParameter } from "./base"
import chalk from "chalk"
import { TaskResults } from "../task-graph"
import { values } from "lodash"

export const deployArgs = {
  service: new StringParameter({
    help: "The name of the service(s) to deploy (skip to deploy all services). " +
      "Use comma as separator to specify multiple services.",
  }),
}

export const deployOpts = {
  watch: new BooleanParameter({ help: "Listen for changes in module(s) and auto-deploy", alias: "w" }),
  force: new BooleanParameter({ help: "Force redeploy of service(s)" }),
  "force-build": new BooleanParameter({ help: "Force rebuild of module(s)" }),
}

export type Args = ParameterValues<typeof deployArgs>
export type Opts = ParameterValues<typeof deployOpts>

export class DeployCommand extends Command<typeof deployArgs, typeof deployOpts> {
  name = "deploy"
  help = "Deploy service(s) to the specified environment"

  arguments = deployArgs
  options = deployOpts

  async action(ctx: PluginContext, args: Args, opts: Opts): Promise<TaskResults | void> {
    const names = args.service ? args.service.split(",") : undefined
    const services = await ctx.getServices(names)

    if (Object.keys(services).length === 0) {
      ctx.log.warn({ msg: "No services found. Aborting." })
      return {}
    }

    const watch = opts.watch
    const force = opts.force
    const forceBuild = opts["force-build"]

    for (const service of values(services)) {
      const task = new DeployTask(ctx, service, force, forceBuild)
      await ctx.addTask(task)
    }

    ctx.log.header({ emoji: "rocket", command: "Deploy" })

    if (watch) {
      const modules = Array.from(new Set(values(services).map(s => s.module)))

      await watchModules(ctx, modules, async (_, module) => {
        const servicesToDeploy = values(await module.getServices()).filter(s => !!services[s.name])
        for (const service of servicesToDeploy) {
          await ctx.addTask(new DeployTask(ctx, service, true, false))
        }
      })
    } else {
      const result = await ctx.processTasks()

      ctx.log.info("")
      ctx.log.info({ emoji: "heavy_check_mark", msg: chalk.green("Done!\n") })

      return result
    }
  }
}
