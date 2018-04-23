/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { map as bluebirdMap } from "bluebird"
import { Client } from "fb-watchman"
import { keyBy } from "lodash"
import { relative, resolve } from "path"
import { Module } from "./types/module"
import { PluginContext } from "./plugin-context"

export type AutoReloadDependants = { [key: string]: Set<Module> }

export interface OnChangeHandler {
  (ctx: PluginContext, module: Module): Promise<void>
}

export async function watchModules(
  ctx: PluginContext, modules: Module[], onChange: OnChangeHandler,
): Promise<FSWatcher> {
  const autoReloadDependants = await computeAutoReloadDependants(modules)

  async function handleChanges(module: Module) {
    await onChange(ctx, module)

    const dependantsForModule = autoReloadDependants[module.name]
    if (!dependantsForModule) {
      return
    }

    for (const dependant of dependantsForModule) {
      await handleChanges(dependant)
    }
  }

  const watcher = new FSWatcher(ctx.projectRoot)
  await watcher.watchModules(modules, "addTasksForAutoReload/",
    async (changedModule) => {
      ctx.log.debug({ msg: `Files changed for module ${changedModule.name}` })
      await handleChanges(changedModule)
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

  constructor(private projectRoot: string) {
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
        expression: ["dirname", relModulePath, ["depth", "ge", 0]]
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
