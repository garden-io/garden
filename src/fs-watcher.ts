import { map as bluebirdMap } from "bluebird"
import { Client } from "fb-watchman"
import { keyBy } from "lodash"
import { resolve } from "path"
import { Module } from "./types/module"
import { GardenContext } from "./context"

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
  readonly ctx: GardenContext
  private readonly client
  private capabilityCheckComplete: boolean

  constructor(ctx: GardenContext) {
    this.ctx = ctx
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

  async watchModules(modules: Module[], subscriptionPrefix: string,
    changeHandler: (Module, SubscriptionResponse) => Promise<void>) {
    if (!this.capabilityCheckComplete) {
      await this.capabilityCheck({ optional: [], required: ["relative_root"] })
    }

    const modulesBySubscriptionKey = keyBy(modules, (m) => FSWatcher.subscriptionKey(subscriptionPrefix, m))

    await bluebirdMap(modules || [], async (module) => {
      const subscriptionKey = FSWatcher.subscriptionKey(subscriptionPrefix, module)
      const modulePath = resolve(this.ctx.projectRoot, module.path)
      const result = await this.command(["watch-project", modulePath])

      const subscriptionRequest = {}

      await this.command([
        "subscribe",
        result.watch,
        subscriptionKey,
        subscriptionRequest])
    })

    this.on("subscription", async (response) => {
      console.log("file changed:", response)
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
