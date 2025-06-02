/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import hasAnsi from "has-ansi"
import { every, repeat, some } from "lodash-es"
import { Stream } from "ts-stream"
import type { DeployAction } from "../actions/deploy.js"
import type { Resolved } from "../actions/types.js"
import type { ConfigGraph } from "../graph/config-graph.js"
import type { Log } from "../logger/log-entry.js"
import { createActionLog } from "../logger/log-entry.js"
import { LogLevel, logLevelMap } from "../logger/logger.js"
import { padSection } from "../logger/renderers.js"
import { PluginEventBroker } from "../plugin-context.js"
import { waitForOutputFlush } from "../process.js"
import type { DeployLogEntry } from "../types/service.js"
import type { MonitorBaseParams } from "./base.js"
import { Monitor } from "./base.js"
import { styles } from "../logger/styles.js"
import type { PickFromUnion } from "../util/util.js"

export const validMonitorColors = ["green", "cyan", "magenta", "yellow", "blueBright", "blue"] as const

type LogMonitorColor = PickFromUnion<keyof typeof chalk, (typeof validMonitorColors)[number]>

export const logMonitorColors: LogMonitorColor[] = [...validMonitorColors]

// Track these globally, across many monitors
let colorMap: { [name: string]: LogMonitorColor } = {}
let colorIndex = -1
// If the container name should be displayed, we align the output wrt to the longest container name
let maxDeployName = 1
const isoStringLength = new Date().toISOString().length

interface LogMonitorParams extends MonitorBaseParams {
  action: Resolved<DeployAction>
  graph: ConfigGraph
  log: Log
  events?: PluginEventBroker

  collect: boolean
  hideService: boolean
  showTags: boolean
  showTimestamps: boolean
  logLevel: LogLevel
  tagFilters?: LogsTagOrFilter
  msgPrefix?: string
  tail?: number
  since?: string
}

export type LogsTagFilter = [string, string]
export type LogsTagAndFilter = LogsTagFilter[]
export type LogsTagOrFilter = LogsTagAndFilter[]

export class LogMonitor extends Monitor {
  type = "log"
  public action: Resolved<DeployAction>

  private readonly graph: ConfigGraph
  private readonly log: Log

  private readonly entries: DeployLogEntry[]
  private readonly events: PluginEventBroker

  private readonly collect: boolean
  private readonly hideService: boolean
  private readonly showTags: boolean
  private readonly showTimestamps: boolean
  private readonly logLevel: LogLevel
  private readonly tagFilters?: LogsTagOrFilter
  // This could be replaced with e.g. a custom render function if more flexibility becomes needed.
  private readonly msgPrefix?: string
  private readonly tail?: number
  private readonly since?: string

  constructor(params: LogMonitorParams) {
    super(params)

    this.action = params.action
    this.graph = params.graph
    this.log = params.log

    this.entries = []
    this.events = params.events || new PluginEventBroker(params.garden)

    this.collect = params.collect
    this.hideService = params.hideService
    this.showTags = params.showTags
    this.showTimestamps = params.showTimestamps
    this.logLevel = params.logLevel
    this.tagFilters = params.tagFilters
    this.msgPrefix = params.msgPrefix
    this.tail = params.tail
    this.since = params.since
  }

  static getColorForName(name: string) {
    if (!colorMap[name]) {
      colorMap[name] = logMonitorColors[++colorIndex % logMonitorColors.length]
    }
    return colorMap[name]
  }

  static resetGlobalState() {
    maxDeployName = 1
    colorMap = {}
    colorIndex = -1
  }

  key() {
    return this.action.key()
  }

  description() {
    return `log monitor for ${this.action.longDescription()}`
  }

  async start() {
    const stream = new Stream<DeployLogEntry>()
    const { default: micromatch } = await import("micromatch")
    const { isMatch } = micromatch

    const matchTagFilters = (entry: DeployLogEntry): boolean => {
      if (!this.tagFilters) {
        return true
      }
      // We OR together the filter results of each tag option instance.
      return some(this.tagFilters, (andFilter: LogsTagAndFilter) => {
        // We AND together the filter results within a given tag option instance.
        return every(andFilter, ([key, value]: LogsTagFilter) => {
          return isMatch(entry.tags?.[key] || "", value)
        })
      })
    }

    void stream.forEach((entry) => {
      // Skip empty entries
      if (skipEntry(entry)) {
        return
      }

      // Match against all of the specified filters, if any
      if (!matchTagFilters(entry)) {
        return
      }

      if (this.collect) {
        this.entries.push(entry)
      } else {
        this.logEntry(entry)
      }
    })

    const router = await this.garden.getActionRouter()
    const actionLog = createActionLog({
      log: this.garden.log,
      actionName: this.action.name,
      actionKind: this.action.kind,
    })
    await router.deploy.getLogs({
      log: actionLog,
      action: this.action,
      follow: !this.collect,
      graph: this.graph,
      stream,
      events: this.events,
      tail: this.tail,
      since: this.since,
    })

    if (this.collect) {
      await waitForOutputFlush()
    }

    return {}
  }

  async stop() {
    this.events.emit("abort")
    return {}
  }

  getEntries() {
    return [...this.entries]
  }

  logEntry(entry: DeployLogEntry) {
    const levelStr = logLevelMap[entry.level || LogLevel.info] || "info"
    const rawMsg = entry.msg
    const terminalMsg = this.formatLogMonitorEntry(entry)
    for (const cmd of this.subscribers) {
      cmd.emit(
        this.log,
        JSON.stringify({ msg: terminalMsg, rawMsg, timestamp: entry.timestamp?.getTime(), level: levelStr })
      )
    }
    this.log[levelStr]({ msg: terminalMsg, rawMsg })
  }

  private formatLogMonitorEntry(entry: DeployLogEntry) {
    const sectionColor = chalk[LogMonitor.getColorForName(entry.name)]
    const sectionStyle = (sectionColor || styles.primary).bold
    const serviceLog = entry.msg
    const entryLevel = entry.level || LogLevel.info

    let timestamp: string | undefined
    let tags: string | undefined

    if (this.showTimestamps && entry.timestamp) {
      timestamp = repeat(" ", isoStringLength)
      try {
        timestamp = entry.timestamp.toISOString()
      } catch {}
    }

    if (this.showTags && entry.tags) {
      tags = Object.entries(entry.tags)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ")
    }

    if (entryLevel <= this.logLevel) {
      maxDeployName = Math.max(maxDeployName, entry.name.length)
    }

    let out = ""
    if (this.msgPrefix) {
      out += this.msgPrefix
    }
    if (!this.hideService) {
      out += `${sectionStyle(padSection(entry.name, maxDeployName))} → `
    }
    if (timestamp) {
      out += `${sectionStyle(timestamp)} → `
    }
    if (tags) {
      out += sectionStyle("[" + tags + "] ")
    }

    out += hasAnsi(serviceLog) ? serviceLog : styles.primary(serviceLog)

    return out
  }
}

export function isLogsMonitor(monitor: Monitor): monitor is LogMonitor {
  return monitor.type === "log"
}

/**
 * Skip empty entries.
 */
function skipEntry(entry: DeployLogEntry) {
  const validDate = entry.timestamp && entry.timestamp instanceof Date && !isNaN(entry.timestamp.getTime())
  return !entry.msg && !validDate
}
