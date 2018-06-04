/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Client } from "fb-watchman"
import {
  findKey,
  mapValues,
  pick,
  set,
  uniqBy,
  values,
} from "lodash"
import { basename, join, relative } from "path"
import { pathToCacheContext } from "./cache"
import { Module } from "./types/module"
import { KeyedSet } from "./util/keyed-set"
import { PluginContext } from "./plugin-context"

export type AutoReloadDependants = { [key: string]: Module[] }

export type ChangeHandler = (modules: Module[], configChanged: boolean) => Promise<void>

export type CapabilityOptions = { required?: string[], optional?: string[] }
export type CapabilityResponse = { error: Error, response: { capabilities: { string: boolean } } }

export type ChangedFile = {
  name: string, // path to the changed file or dir
  size: number,
  exists: boolean,
  type: string,
}

export type SubscriptionResponse = {
  root: string,
  subscription: string,
  files: ChangedFile[],
}

type RelativeModuleRoots = {
  [key: string]: string,
}

type ProcessedChanges = {
  configChanged: boolean,
  changedModuleNames: string[],
}

/*
  Resolves to modules and their build & service dependency modules (recursively).
  Each module is represented at most once in the output.
*/
export async function autoReloadModules(modules: Module[]): Promise<Module[]> {
  const moduleSet = new KeyedSet<Module>(m => m.name)

  const scanner = async (module: Module) => {
    moduleSet.add(module)
    for (const dep of await uniqueDependencyModules(module)) {
      if (!moduleSet.has(dep)) {
        await scanner(dep)
      }
    }
  }

  for (const m of modules) {
    await scanner(m)
  }

  return moduleSet.entries()
}

/*
  Similar to autoReloadModules above, but uses pre-computed auto reload dependants
  instead of traversing module configs (and thus doesn't need to be async).
*/
export function withDependants(modules: Module[], autoReloadDependants: AutoReloadDependants): Module[] {
  const moduleSet = new KeyedSet<Module>(m => m.name)

  const scanner = (module: Module) => {
    moduleSet.add(module)
    for (const dependant of (autoReloadDependants[module.name] || [])) {
      if (!moduleSet.has(dependant)) {
        scanner(dependant)
      }
    }
  }

  for (const m of modules) {
    scanner(m)
  }

  return moduleSet.entries()
}

export async function computeAutoReloadDependants(ctx: PluginContext):
  Promise<AutoReloadDependants> {
  const dependants = {}

  for (const module of await ctx.getModules()) {
    const depModules: Module[] = await uniqueDependencyModules(module)
    for (const dep of depModules) {
      set(dependants, [dep.name, module.name], module)
    }
  }

  return mapValues(dependants, values)
}

async function uniqueDependencyModules(module: Module): Promise<Module[]> {
  const buildDepModules = await module.getBuildDependencies()
  const serviceDepModules = (await module.getServiceDependencies()).map(s => s.module)
  return uniqBy(buildDepModules.concat(serviceDepModules), m => m.name)
}

export class FSWatcher {
  private readonly client
  private capabilityCheckComplete: boolean

  constructor(private ctx: PluginContext) {
    this.client = new Client()
    this.capabilityCheckComplete = false
  }

  /*
    Wrapper around Facebook's Watchman library.

    See also: https://facebook.github.io/watchman/docs/nodejs.html
    for further documentation.
   */

  command(args: any[]): Promise<any> {
    return new Promise((res, rej) => {
      this.client.command(args, (error: Error, result: object) => {
        if (error) {
          this.ctx.log.error(`Error while executing watcher.command, args were ${args}, error is: ${error}`)
          rej(error)
        }

        res(result)
      })
    })
  }

  async watchModules(
    modules: Module[], subscriptionPrefix: string,
    changeHandler: ChangeHandler,
  ) {

    const _this = this

    if (!this.capabilityCheckComplete) {
      await this.capabilityCheck({ optional: [], required: ["relative_root"] })
    }

    const watchResult = await this.command(["watch-project", this.ctx.projectRoot])

    const subscriptionRequest = {
      since: (await this.command(["clock", watchResult.watch])).clock,
    }

    // Needed when this.ctx.projectRoot is a subdir of the dir where .git is located.
    const prefix = relative(watchResult.watch, this.ctx.projectRoot)

    const modulesByName = {}
    const relModuleRoots: RelativeModuleRoots = {}

    modules.forEach(m => {
      modulesByName[m.name] = m
      relModuleRoots[m.name] = join(prefix, relative(this.ctx.projectRoot, m.path))
    })

    await this.command([
      "subscribe",
      watchResult.watch,
      FSWatcher.subscriptionKey(subscriptionPrefix),
      subscriptionRequest,
    ])

    this.on("subscription", async (response: SubscriptionResponse) => {
      const { configChanged, changedModuleNames } = this.processChangedFiles(response.files, relModuleRoots)
      const changedModules: Module[] = values(pick(modulesByName, changedModuleNames))

      for (const changedModule of changedModules) {
        // invalidate the cache for anything attached to the module path or upwards in the directory tree
        const cacheContext = pathToCacheContext(changedModule.path)
        _this.ctx.invalidateCacheUp(cacheContext)
      }

      await changeHandler(changedModules, configChanged)
    })
  }

  capabilityCheck(options: CapabilityOptions): Promise<CapabilityResponse> {
    return new Promise((res, rej) => {
      this.client.capabilityCheck(options, (error: Error, response: CapabilityResponse) => {
        if (error) {
          // TODO: Error logging
          rej(error)
        }

        if ("warning" in response) {
          // TODO: Warning logging
        }

        res(response)
      })
    })
  }

  on(eventType: string, handler: (response: SubscriptionResponse) => void): void {
    this.client.on(eventType, handler)
  }

  end(): void {
    this.client.end()
  }

  private processChangedFiles(files: ChangedFile[], relModuleRoots: RelativeModuleRoots): ProcessedChanges {
    let configChanged = false
    let changedModuleNames: Set<string> = new Set()
    for (const f of files) {

      if (basename(f.name) === "garden.yml") {
        configChanged = true
        changedModuleNames.clear() // A Garden-level restart will be triggered, so these are irrelevant
        break
      }

      const changedModuleName = findKey(relModuleRoots,
        (relPath) => f.name.startsWith(relPath))

      if (changedModuleName) {
        changedModuleNames.add(changedModuleName)
      }

    }
    return { configChanged, changedModuleNames: Array.from(changedModuleNames) }
  }

  private static subscriptionKey(prefix: string) {
    return `${prefix}Subscription`
  }
}
