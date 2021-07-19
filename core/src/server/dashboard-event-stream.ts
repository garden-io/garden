/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BufferedEventStream, ConnectBufferedEventStreamParams } from "../enterprise/buffered-event-stream"
import { GardenProcess } from "../db/entities/garden-process"
import { Profile } from "../util/profiling"
import { isEqual } from "lodash"

const targetUpdateIntervalMsec = 1000

@Profile()
export class DashboardEventStream extends BufferedEventStream {
  protected intervalMsec = 250

  private targetPollIntervalId?: NodeJS.Timeout
  private ignoreHost: string | undefined

  constructor(params) {
    super(params)
    this.eventNames.push("log")
  }

  connect(params: ConnectBufferedEventStreamParams & { ignoreHost?: string }) {
    // Need this so the dashboard command doesn't try to send events to itself.
    // We can't ignore by PID because we wouldn't be able to unit test easily.
    this.ignoreHost = params.ignoreHost
    super.connect(params)
  }

  /**
   * Updates the list of active dashboard servers to stream events to.
   * Returns the list of Garden processes matching the current project/env that are active servers.
   */
  async updateTargets() {
    if (!this.garden) {
      return []
    }

    const running = await GardenProcess.getActiveProcesses()
    const servers = running.filter(
      (p) =>
        !!p.persistent &&
        !!p.serverHost &&
        !!p.serverAuthKey &&
        !!p.command &&
        p.projectName === this.garden.projectName &&
        p.projectRoot === this.garden.projectRoot &&
        p.environmentName === this.garden.environmentName &&
        p.namespace === this.garden.namespace &&
        !(this.ignoreHost && p.serverHost === this.ignoreHost)
    )

    const currentHosts = this.targets.map((p) => p.host).sort()
    const newHosts = servers.map((p) => p.serverHost!).sort()

    this.targets = servers.map((p) => ({ host: p.serverHost!, clientAuthToken: p.serverAuthKey!, enterprise: false }))

    // Notify of updates
    if (this.garden && !isEqual(currentHosts, newHosts)) {
      this.log.debug(`Updated list of running dashboard servers: ${servers.map((p) => p.serverHost).join(", ")}`)

      this.garden.events.emit("serversUpdated", {
        servers: servers.map((p) => ({ command: p.command!, host: p.serverHost! })),
      })
    }

    return servers
  }

  /**
   * Poll for running dashboard servers
   */
  startInterval() {
    super.startInterval()

    this.targetPollIntervalId = setInterval(() => {
      this.updateTargets().catch((err) => {
        this.log.error(err)
      })
    }, targetUpdateIntervalMsec)
  }

  async close() {
    if (this.targetPollIntervalId) {
      clearInterval(this.targetPollIntervalId)
      delete this.targetPollIntervalId
    }
    await super.close()
  }

  streamLogEntry() {
    // Not streaming log events for now
    return
  }
}
