/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Bluebird from "bluebird"
import chalk from "chalk"
import { flatten } from "lodash"
import moment = require("moment")
import { join } from "path"

import { BuildTask } from "../tasks/build"
import { Task } from "../tasks/base"
import {
  Command,
  CommandResult,
  CommandParams,
} from "./base"
import { STATIC_DIR } from "../constants"
import { processModules } from "../process"
import { readFile } from "fs-extra"
import { Module } from "../types/module"
import { getTestTasks } from "./test"
import { computeAutoReloadDependants, withDependants } from "../watch"
import { getDeployTasks } from "../tasks/deploy"

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

    const autoReloadDependants = await computeAutoReloadDependants(ctx)
    const modules = await ctx.getModules()

    if (modules.length === 0) {
      if (modules.length === 0) {
        ctx.log.info({ msg: "No modules found in project." })
      }
      ctx.log.info({ msg: "Aborting..." })
      return {}
    }

    const tasksForModule = (watch: boolean) => {
      return async (module: Module) => {

        const testModules: Module[] = watch
          ? (await withDependants(ctx, [module], autoReloadDependants))
          : [module]

        const testTasks: Task[] = flatten(await Bluebird.map(
          testModules, m => getTestTasks({ ctx, module: m })))

        const deployTasks = await getDeployTasks({
          ctx, module, force: watch, forceBuild: watch, includeDependants: watch,
        })
        const tasks = testTasks.concat(deployTasks)

        if (tasks.length === 0) {
          return [new BuildTask({ ctx, module, force: watch })]
        } else {
          return tasks
        }
      }

    }

    await processModules({
      ctx,
      garden,
      modules,
      watch: true,
      handler: tasksForModule(false),
      changeHandler: tasksForModule(true),
    })

    return {}
  }
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
