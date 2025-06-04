/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Action } from "../actions/types.js"
import type { Log } from "../logger/log-entry.js"
import type { PluginEventBroker } from "../plugin-context.js"
import type { MonitorBaseParams } from "./base.js"
import { Monitor } from "./base.js"

interface HandlerMonitorParams extends MonitorBaseParams {
  type: string
  events: PluginEventBroker
  key: string
  description: string
  action?: Action
  log: Log
}

/**
 * Generic monitor that basically waits until plugin events indicate completion of a handler
 */
export class HandlerMonitor extends Monitor {
  public type: string
  public action?: Action

  private readonly events: PluginEventBroker
  private readonly _key: string
  private readonly _description: string
  // private log: Log

  isActive: boolean

  constructor(params: HandlerMonitorParams) {
    super(params)
    this.type = params.type
    this.events = params.events
    this.action = params.action
    this._key = params.key
    this._description = params.description
    this.isActive = true
    // this.log = params.log.createLog({ section: params.action?.key() })

    this.events.on("abort", () => this.done())
    this.events.on("done", () => this.done())
    // TODO: log error if any given (done in relevant plugin handlers for now)
    this.events.on("failed", () => this.done())
  }

  key() {
    return this._key
  }

  description() {
    return this._description
  }

  async start() {
    // This is done in the constructor, nothing to do here
  }

  private done() {
    this.isActive = false
    this.events.removeAllListeners()
  }

  async stop() {
    this.events.emit("abort")
    // TODO: wait until handler signals exit
  }
}
