/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { DeployAction } from "../actions/deploy.js"
import type { Executed } from "../actions/types.js"
import type { ConfigGraph } from "../graph/config-graph.js"
import type { ActionLog, Log } from "../logger/log-entry.js"
import { createActionLog } from "../logger/log-entry.js"
import { PluginEventBroker } from "../plugin-context.js"
import type { ActionRouter } from "../router/router.js"
import type { MonitorBaseParams } from "./base.js"
import { Monitor } from "./base.js"

interface SyncMonitorParams extends MonitorBaseParams {
  action: Executed<DeployAction>
  graph: ConfigGraph
  log: Log
  stopOnExit: boolean
}

/**
 * Monitor the sync status for the given Deploy
 */
export class SyncMonitor extends Monitor {
  type = "sync"

  public action: Executed<DeployAction>
  private graph: ConfigGraph
  private log: Log
  private events: PluginEventBroker
  private actionLog?: ActionLog
  private router?: ActionRouter
  private stopOnExit: boolean

  constructor(params: SyncMonitorParams) {
    super(params)
    this.action = params.action
    this.graph = params.graph
    this.log = params.log.createLog({ name: params.action.key() })
    this.events = new PluginEventBroker(params.garden)
    this.stopOnExit = params.stopOnExit
  }

  key() {
    return this.action.key()
  }

  description() {
    return `sync monitor for ${this.action.longDescription()}`
  }

  async start() {
    this.router = await this.garden.getActionRouter()
    this.actionLog = createActionLog({ log: this.log, actionName: this.action.name, actionKind: this.action.kind })
    await this.router.deploy.getSyncStatus({
      log: this.actionLog,
      action: this.action,
      monitor: true,
      graph: this.graph,
      events: this.events,
    })

    return {}
  }

  async stop() {
    if (this.stopOnExit && this.router && this.actionLog) {
      await this.router.deploy.stopSync({ log: this.actionLog, action: this.action, graph: this.graph })
      this.actionLog.info({ symbol: "success", msg: `Stopped sync` })
    } else {
      this.events.emit("abort")
    }
    return {}
  }
}
