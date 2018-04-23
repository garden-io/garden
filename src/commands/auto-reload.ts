/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginContext } from "../plugin-context"
import { BuildTask } from "../tasks/build"
import { DeployTask } from "../tasks/deploy"
import {
  registerCleanupFunction,
  sleep,
} from "../util"
import { watchModules } from "../watch"
import { Command } from "./base"
import {
  values,
  keys,
} from "lodash"

export class AutoReloadCommand extends Command {
  name = "autoreload"
  help = "Auto-reload modules when sources change"

  async action(ctx: PluginContext): Promise<void> {
    const modules = values(await ctx.getModules())

    if (modules.length === 0) {
      if (modules.length === 0) {
        ctx.log.info({ msg: "No modules found in project." })
      }
      ctx.log.info({ msg: "Aborting..." })
      return
    }

    const watcher = await watchModules(ctx, modules, async (_, module) => {
      const serviceNames = keys(module.services || {})

      if (serviceNames.length === 0) {
        await ctx.addTask(new BuildTask(ctx, module, false))
      } else {
        for (const service of values(await ctx.getServices(serviceNames))) {
          await ctx.addTask(new DeployTask(ctx, service, true, true))
        }
      }
    })

    registerCleanupFunction("clearAutoReloadWatches", () => {
      watcher.end()
    })

    while (true) {
      ctx.log.info({ msg: "Sup bruh" })
      await sleep(1000)
    }
  }

}
