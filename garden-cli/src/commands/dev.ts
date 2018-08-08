/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginContext } from "../plugin-context"
import { BuildTask } from "../tasks/build"
import { Task } from "../tasks/base"
import {
  Command,
  CommandResult,
  CommandParams,
} from "./base"
import { join } from "path"
import { STATIC_DIR } from "../constants"
import chalk from "chalk"
import moment = require("moment")
import { processModules } from "../process"
import { readFile } from "fs-extra"
import { Module } from "../types/module"
import { DeployTask } from "../tasks/deploy"
import { getTestTasks } from "./test"
import { getNames } from "../util/util"

const ansiBannerPath = join(STATIC_DIR, "garden-banner-2.txt")

// TODO: allow limiting to certain modules and/or services
export class DevCommand extends Command {
  name = "dev"
  help = "Starts the garden development console."

  description = `
    The Garden dev console is a combination of the \`build\`, \`deploy\` and \`test\` commands.
    It builds, deploys and tests all your modules and services, and re-builds, re-deploys and re-tests
    as you modify the code.

    Examples:

        garden dev
  `

  async action({ garden, ctx }: CommandParams): Promise<CommandResult> {
    // print ANSI banner image
    const data = await readFile(ansiBannerPath)
    console.log(data.toString())

    ctx.log.info(chalk.gray.italic(`\nGood ${getGreetingTime()}! Let's get your environment wired up...\n`))

    await ctx.configureEnvironment({})

    const modules = await ctx.getModules()

    if (modules.length === 0) {
      if (modules.length === 0) {
        ctx.log.info({ msg: "No modules found in project." })
      }
      ctx.log.info({ msg: "Aborting..." })
      return {}
    }

    await processModules({
      modules,
      garden,
      ctx,
      watch: true,
      process: async (module) => {
        const testTasks: Task[] = await getTestTasks({ ctx, module })
        const deployTasks = await getDeployTasks({ ctx, module })
        const tasks = testTasks.concat(deployTasks)

        if (tasks.length === 0) {
          return [new BuildTask({ ctx, module, force: false })]
        } else {
          return tasks
        }
      },
    })

    return {}
  }
}

async function getDeployTasks(
  { ctx, module, force = false, forceBuild = false }:
    { ctx: PluginContext, module: Module, force?: boolean, forceBuild?: boolean },
): Promise<DeployTask[]> {
  const services = await ctx.getServices(getNames(module.serviceConfigs))

  return services.map(service => new DeployTask({ ctx, service, force, forceBuild }))
}

function getGreetingTime() {
  const m = moment()

  const currentHour = parseFloat(m.format("HH"))

  if (currentHour >= 17) {
    return "evening"
  } else if (currentHour >= 12) {
    return "afternoon"
  } else {
    return "morning"
  }
}
