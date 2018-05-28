/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { map as bluebirdMap } from "bluebird"
import { Client } from "fb-watchman"
import { keyBy, uniqBy, values } from "lodash"
import { relative, resolve } from "path"
import { pathToCacheContext } from "./cache"
import { Module } from "./types/module"
import { PluginContext } from "./plugin-context"

export type AutoReloadDependants = { [key: string]: Set<Module> }

export interface OnChangeHandler {
  (ctx: PluginContext, module: Module): Promise<void>
}

/*
  Resolves to modules and their build & service dependency modules (recursively).
  Each module is represented at most once in the output.
*/
export async function autoReloadModules(modules: Module[]): Promise<Module[]> {
  const modulesByName = {}

  const scanner = async (module: Module, byName: object) => {
    byName[module.name] = module
    for (const dep of await uniqueDependencyModules(module)) {
      if (!byName[dep.name]) {
        await scanner(dep, byName)
      }
    }
  }

  for (const m of modules) {
    await scanner(m, modulesByName)
  }

  return values(modulesByName)
}

export async function computeAutoReloadDependants(ctx: PluginContext):
  Promise<AutoReloadDependants> {
  const dependants = {}

  for (const module of await ctx.getModules()) {
    const depModules: Module[] = await uniqueDependencyModules(module)
    for (const dep of depModules) {
      dependants[dep.name] = (dependants[dep.name] || new Set()).add(module)
    }
  }

  return dependants
}

async function uniqueDependencyModules(module: Module): Promise<Module[]> {
  const buildDepModules = await module.getBuildDependencies()
  const serviceDepModules = (await module.getServiceDependencies()).map(s => s.module)
  return uniqBy(buildDepModules.concat(serviceDepModules), m => m.name)
}

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

export class FSWatcher {
  private readonly client
  private capabilityCheckComplete: boolean
  private projectRoot: string

  constructor(private ctx: PluginContext) {
    this.client = new Client()
    this.capabilityCheckComplete = false
    this.projectRoot = ctx.projectRoot
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
          // TODO: Error logging
          console.error(error)
          rej(error)
        }

        res(result)
      })
    })
  }

  // WIP
  async watchModules(
    modules: Module[], subscriptionPrefix: string,
    changeHandler: (module: Module, response: SubscriptionResponse) => Promise<void>,
  ) {
    const _this = this

    if (!this.capabilityCheckComplete) {
      await this.capabilityCheck({ optional: [], required: ["relative_root"] })
    }

    const modulesBySubscriptionKey = keyBy(modules, (m) => FSWatcher.subscriptionKey(subscriptionPrefix, m))

    await bluebirdMap(modules || [], async (module) => {
      const subscriptionKey = FSWatcher.subscriptionKey(subscriptionPrefix, module)
      const modulePath = resolve(this.projectRoot, module.path)

      const result = await this.command(["watch-project", modulePath])
      const relModulePath = relative(result.watch, modulePath)

      const subscriptionRequest = {
        expression: ["dirname", relModulePath, ["depth", "ge", 0]],
      }

      await this.command([
        "subscribe",
        result.watch,
        subscriptionKey,
        subscriptionRequest])
    })

    this.on("subscription", async (response) => {
      const changedModule = modulesBySubscriptionKey[response.subscription]
      if (!changedModule) {
        console.log("no module found for changed file, skipping auto-rebuild")
        return
      }

      // invalidate the cache for anything attached to the module path or upwards in the directory tree
      const cacheContext = pathToCacheContext(changedModule.path)
      _this.ctx.invalidateCacheUp(cacheContext)

      await changeHandler(changedModule, response)
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

  private static subscriptionKey(prefix: string, module: Module) {
    return `${prefix}${module.name}Subscription`
  }
}
