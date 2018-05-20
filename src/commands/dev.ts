/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginContext } from "../plugin-context"
import { BuildTask } from "../tasks/build"
import { Task } from "../types/task"
import { Command } from "./base"
import { join } from "path"
import { STATIC_DIR } from "../constants"
import { spawnSync } from "child_process"
import chalk from "chalk"
import Bluebird = require("bluebird")
import moment = require("moment")

const imgcatPath = join(STATIC_DIR, "imgcat")
const bannerPath = join(STATIC_DIR, "garden-banner-1-half.png")

export class DevCommand extends Command {
  name = "dev"
  help = "Starts the garden development console"

  async action(ctx: PluginContext) {
    try {
      spawnSync(imgcatPath, [bannerPath], {
        stdio: "inherit",
      })
    } catch (_) {
      // the above fails for terminals other than iTerm2. just ignore the error and move on.
    }

    ctx.log.info(chalk.gray.italic(`\nGood ${getGreetingTime()}! Let's get your environment wired up...\n`))

    await ctx.configureEnvironment()

    const modules = await ctx.getModules()

    if (modules.length === 0) {
      if (modules.length === 0) {
        ctx.log.info({ msg: "No modules found in project." })
      }
      ctx.log.info({ msg: "Aborting..." })
      return
    }

    await ctx.processModules(modules, true, async (module) => {
      const testTasks: Task[] = await module.getTestTasks({})
      const deployTasks = await module.getDeployTasks({})
      const tasks = testTasks.concat(deployTasks)

      if (tasks.length === 0) {
        await ctx.addTask(await BuildTask.factory({ ctx, module, force: false }))
      } else {
        await Bluebird.map(tasks, ctx.addTask)
      }
    })
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
