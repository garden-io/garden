/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { DeployAction } from "../actions/deploy"
import { Executed } from "../actions/types"
import { ConfigGraph } from "../graph/config-graph"
import { createActionLog, Log } from "../logger/log-entry"
import { PluginEventBroker } from "../plugin-context"
import { MonitorBaseParams, Monitor } from "./base"

interface SyncMonitorParams extends MonitorBaseParams {
  action: Executed<DeployAction>
  graph: ConfigGraph
  log: Log
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

  constructor(params: SyncMonitorParams) {
    super(params)
    this.action = params.action
    this.graph = params.graph
    this.log = params.log.createLog({ section: params.action.key() })
    this.events = new PluginEventBroker(params.garden)
  }

  key() {
    return this.action.key()
  }

  description() {
    return `sync monitor for ${this.action.longDescription()}`
  }

  async start() {
    const router = await this.garden.getActionRouter()
    const actionLog = createActionLog({ log: this.log, actionName: this.action.name, actionKind: this.action.kind })
    await router.deploy.getSyncStatus({
      log: actionLog,
      action: this.action,
      monitor: true,
      graph: this.graph,
      events: this.events,
    })

    return {}
  }

  async stop() {
    this.events.emit("abort")
    return {}
  }
}
