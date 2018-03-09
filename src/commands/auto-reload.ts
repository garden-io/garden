import { keys, values } from "lodash"
import { Command } from "./base"
import { Module } from "../types/module"
import { GardenContext } from "../context"
import { FSWatcher } from "../fs-watcher"
import { BuildTask } from "../tasks/build"
import { DeployTask } from "../tasks/deploy"
import { registerCleanupFunction, sleep } from "../util"

export type AutoReloadDependants = { [key: string]: Set<Module> }

async function registerAutoReloadWatches(ctx: GardenContext): Promise<FSWatcher | null> {
  const allModules = values(await ctx.getModules())
  const modules = allModules.filter((m) => !m.skipAutoReload)

  if (modules.length === 0) {
    if (allModules.length === 0) {
      ctx.log.info({ msg: "No modules found in project." })
    } else {
      ctx.log.info({ msg: "All modules in project have skipAutoReload = true." })
    }
    ctx.log.info({ msg: "Aborting..." })
    return null
  }

  const autoReloadDependants = await computeAutoReloadDependants(modules)

  const watcher = new FSWatcher(ctx)
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
    for (const dep of deps.filter(d => !d.skipAutoReload)) {
      dependants[dep.name] = (dependants[dep.name] || new Set()).add(module)
    }
  }

  return dependants
}

export async function addTasksForAutoReload(ctx: GardenContext, module: Module, dependants: AutoReloadDependants) {
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

  async action(ctx: GardenContext): Promise<void> {
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
