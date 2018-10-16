/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

export type HotReloadHandler = () => Promise<any>

/**
 * Serializes and de-duplicates hot reload requests per module to prevent race conditions and avoid
 * unnecessary hot reloads.
 *
 * E.g. if two hot reload requests are submitted for a given module while it is being hot-reloaded,
 * exactly one hot reload will be run after the currently executing hot reload completes.
 *
 * Note: All hot reload requests for a given moduleName are considered logically equivalent
 * by this implementation.
 */
export class HotReloadScheduler {
  private pending: { [moduleName: string]: HotReloadRequest }

  constructor() {
    this.pending = {}
  }

  requestHotReload(moduleName: string, hotReloadHandler: HotReloadHandler): Promise<any> {

    const pendingRequest = this.pending[moduleName]

    const prom = new Promise((resolve, reject) => {
      if (pendingRequest) {
        pendingRequest.addPromiseCallbacks(resolve, reject)
      } else {
        this.pending[moduleName] = new HotReloadRequest(hotReloadHandler, resolve, reject)
      }
    })

    /**
     * We disable the no-floating-promises tslint rule when calling this.process, since we are, in fact,
     * properly handling these promises, though the control flow here is somewhat unusual (by design).
     */

    // tslint:disable-next-line:no-floating-promises
    this.process(moduleName)

    return prom

  }

  async process(moduleName: string) {
    const request = this.pending[moduleName]

    if (!request) {
      return
    }

    delete this.pending[moduleName]
    await request.process()

    // tslint:disable-next-line:no-floating-promises
    this.process(moduleName)
  }

}

type PromiseCallback = (any) => any

class HotReloadRequest {
  private handler: HotReloadHandler
  private promiseCallbacks: {
    resolve: PromiseCallback
    reject: PromiseCallback,
  }[]

  constructor(handler: HotReloadHandler, resolve: PromiseCallback, reject: PromiseCallback) {
    this.handler = handler
    this.promiseCallbacks = [{ resolve, reject }]
  }

  addPromiseCallbacks(resolve: () => any, reject: () => any) {
    this.promiseCallbacks.push({ resolve, reject })
  }

  async process() {
    try {
      const result = await this.handler()
      for (const { resolve } of this.promiseCallbacks) {
        resolve(result)
      }
    } catch (error) {
      for (const { reject } of this.promiseCallbacks) {
        reject(error)
      }
    } finally {
      this.promiseCallbacks = []
    }
  }

}
