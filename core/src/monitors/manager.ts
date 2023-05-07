/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import type { Command } from "../commands/base"
import type { Garden } from "../garden"
import type { Log } from "../logger/log-entry"
import { LogLevel } from "../logger/logger"
import { TypedEventEmitter } from "../util/events"
import { KeyedSet } from "../util/keyed-set"
import type { Monitor } from "./base"

type MonitorStatus = "starting" | "started" | "stopping" | "stopped"

interface MonitorEvents {
  monitorStatus: { monitor: Monitor; status: MonitorStatus }
}

export class MonitorManager extends TypedEventEmitter<MonitorEvents> {
  private monitors: KeyedSet<Monitor>
  private monitorStatuses: Map<string, MonitorStatus>
  private log: Log

  constructor(garden: Garden) {
    super()

    this.monitors = new KeyedSet<Monitor>((monitor) => monitor.id())
    this.monitorStatuses = new Map()

    this.log = garden.log.createLog({ name: "[monitors]" })

    garden.events.on("_exit", () => this.stopAll())
    // TODO: see if we want this
    garden.events.on("_restart", () => this.stopAll())
  }

  add(monitor: Monitor) {
    const status = this.getStatus(monitor)

    // TODO: Handle case when monitor has status "stopping"
    if (this.monitors.has(monitor) && status !== "stopped") {
      this.log.debug(`${monitor.description()} already registered and active.`)
      return
    } else if (this.monitors.has(monitor) && status === "stopped") {
      this.log.debug(`Restarting stopped monitor ${monitor.description()}.`)
      this.start(monitor)
    } else {
      this.log.debug(`Added ${monitor.description()}.`)
      this.monitors.add(monitor)
      this.start(monitor)
    }
  }

  getAll() {
    return this.monitors.entries()
  }

  getActive() {
    return this.monitors.entries().filter((m) => this.getStatus(m) !== "stopped")
  }

  find({ type, key }: { type?: string; key?: string }) {
    return this.getAll().filter((m) => (!type || type === m.type) && (!key || key === m.key()))
  }

  getByCommand(command: Command) {
    return this.getAll().filter((m) => m.command === command)
  }

  getById(id: string) {
    return this.getAll().find((m) => m.id() === id)
  }

  getStatus(monitor: Monitor) {
    return this.monitorStatuses.get(monitor.id()) || "stopped"
  }

  private setStatus(monitor: Monitor, status: MonitorStatus) {
    const previous = this.getStatus(monitor)
    if (status !== previous) {
      this.monitorStatuses.set(monitor.id(), status)
      this.emit("monitorStatus", { monitor, status })
      this.log.debug(`${monitor.description()} is ${status}.`)
    }
  }

  start(monitor: Monitor) {
    let status = this.getStatus(monitor)

    if (status !== "stopped" && status !== "stopping") {
      this.log.silly(`${monitor.description()} already ${status}.`)
      return
    }

    this.setStatus(monitor, "starting")

    this.log.verbose(`Starting ${monitor.description()}...`)

    monitor
      .start()
      .then(() => {
        // A monitor may have been stopped while waiting on this repsonse. If that's the case we don't overwrite the status here.
        // NOTE: Condsider calling this.stop() in that case to guarantee the actual monitors stops (would assume stopping is idempotent).
        const currentStatus = this.getStatus(monitor)
        if (currentStatus === "starting") {
          this.log.silly(`${monitor.description} started successfully`)
          this.setStatus(monitor, "started")
        } else {
          this.log.silly(
            `${monitor.description} status changed from 'starting' to ${currentStatus} while being started. Will not set status to 'started'.`
          )
        }
      })
      .catch((error) => {
        this.log.error({ msg: chalk.red(`${monitor.description()} failed: ${error}`), error })
        this.setStatus(monitor, "stopped")
        // TODO: should we retry up to some limit?
      })
  }

  stop(monitor: Monitor, logOverride?: Log) {
    const log = logOverride || this.log.createLog({ fixLevel: LogLevel.verbose })
    log.verbose(`Stopping ${monitor.description()}...`)

    this.setStatus(monitor, "stopping")

    monitor
      .stop()
      .then(() => {
        // A monitor may have been started while waiting on this repsonse. If that's the case we don't overwrite the status here.
        // NOTE: Condsider calling this.start() in that case to guarantee the actual monitors starts (would assume starting is idempotent).
        const currentStatus = this.getStatus(monitor)
        if (currentStatus === "stopping") {
          this.setStatus(monitor, "stopped")
          this.removeAllListeners()
          log.silly(`${monitor.description()} stopped.`)
        } else {
          this.log.silly(
            `${monitor.description} status changed from 'stopping' to ${currentStatus} while being stopped. Will not set status to 'stopped'.`
          )
        }
      })
      .catch((error) => {
        log.error(chalk.red(`Error when stopping ${monitor.description()}: ${error}`))
        this.setStatus(monitor, "stopped")
      })
  }

  stopAll() {
    this.monitors.entries().forEach((monitor) => this.stop(monitor))
  }

  /**
   * Returns true if one or more monitors are registered and running
   */
  anyMonitorsActive() {
    for (const monitor of this.getAll()) {
      const status = this.getStatus(monitor)
      if (status !== "stopped") {
        return true
      }
    }

    return false
  }

  /**
   * Wait for monitors to exit.
   *
   * Optionally specify which monitors to wait for by ID, otherwise waits for all.
   */
  async waitUntilStopped(ids?: string[]) {
    return new Promise<void>((resolve) => {
      const handler = () => {
        const activeMonitors = this.getActive().filter((m) => (ids ? ids.includes(m.id()) : true))
        if (activeMonitors.length === 0) {
          resolve()
          this.off("monitorStatus", handler)
        }
      }

      this.on("monitorStatus", handler)

      handler()
    })
  }
}
