/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { keys, values } from "lodash"
import { Command } from "./base"
import { Module } from "../types/module"
import { FSWatcher } from "../fs-watcher"
import { PluginContext } from "../plugin-context"
import { BuildTask } from "../tasks/build"
import { DeployTask } from "../tasks/deploy"
import { registerCleanupFunction, sleep } from "../util"

export type AutoReloadDependants = { [key: string]: Set<Module> }

async function registerAutoReloadWatches(ctx: PluginContext): Promise<FSWatcher | null> {
  const modules = values(await ctx.getModules())

  if (modules.length === 0) {
    if (modules.length === 0) {
      ctx.log.info({ msg: "No modules found in project." })
    }
    ctx.log.info({ msg: "Aborting..." })
    return null
  }

  const autoReloadDependants = await computeAutoReloadDependants(modules)

  const watcher = new FSWatcher(ctx.projectRoot)
  watcher.watchModules(modules, "addTasksForAutoReload/",
    async (changedModule, _) => {
      ctx.log.info({ msg: `files changed for module ${changedModule.name}` })
      await addTasksForAutoReload(ctx, changedModule, autoReloadDependants)
      await ctx.processTasks()
    })

  return watcher
}

export async function computeAutoReloadDependants(modules: Module[]):
  Promise<AutoReloadDependants> {
  let dependants = {}

  for (const module of modules) {
    const deps = await module.getBuildDependencies()
    for (const dep of deps) {
      dependants[dep.name] = (dependants[dep.name] || new Set()).add(module)
    }
  }

  return dependants
}

export async function addTasksForAutoReload(ctx: PluginContext, module: Module, dependants: AutoReloadDependants) {
  const serviceNames = keys(module.services || {})

  if (serviceNames.length === 0) {
    await ctx.addTask(new BuildTask(ctx, module, false))
  } else {
    for (const service of values(await ctx.getServices(serviceNames))) {
      await ctx.addTask(new DeployTask(ctx, service, true, true))
    }
  }

  const dependantsForModule = dependants[module.name]
  if (!dependantsForModule) {
    return
  }
  for (const dependant of dependantsForModule) {
    await addTasksForAutoReload(ctx, dependant, dependants)
  }
}

export class AutoReloadCommand extends Command {
  name = "autoreload"
  help = "Auto-reload modules when sources change"

  async action(ctx: PluginContext): Promise<void> {
    const watcher = await registerAutoReloadWatches(ctx)

    if (!watcher) {
      return
    }

    registerCleanupFunction("clearAutoReloadWatches", () => {
      ctx.log.info({ msg: "Clearing autoreload watches" })
      watcher.end()
    })

    while (true) {
      ctx.log.info({ msg: "Sup bruh" })
      await sleep(1000)
    }
  }

}
