/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, CommandResult, CommandParams, PrepareParams } from "./base"
import chalk from "chalk"
import { sortBy } from "lodash"
import { ServiceLogEntry } from "../types/plugin/service/getServiceLogs"
import Bluebird = require("bluebird")
import { GardenService } from "../types/service"
import Stream from "ts-stream"
import { LoggerType, logLevelMap, LogLevel, parseLogLevel } from "../logger/logger"
import { StringsParameter, BooleanParameter, IntegerParameter, DurationParameter } from "../cli/params"
import { printHeader, renderDivider } from "../logger/util"
import stripAnsi = require("strip-ansi")
import hasAnsi = require("has-ansi")
import { dedent } from "../util/string"
import { formatSection } from "../logger/renderers"
import { PluginEventBroker } from "../plugin-context"

const logsArgs = {
  services: new StringsParameter({
    help:
      "The name(s) of the service(s) to log (skip to log all services). " +
      "Use comma as a separator to specify multiple services.",
  }),
}

const logsOpts = {
  "follow": new BooleanParameter({
    help: "Continuously stream new logs from the service(s).",
    alias: "f",
  }),
  "tail": new IntegerParameter({
    help: dedent`
      Number of lines to show for each service. Defaults to showing all log lines (up to a certain limit). Takes precedence over
      the \`--since\` flag if both are set. Note that we don't recommend using a large value here when in follow mode.
    `,
    alias: "t",
  }),
  "show-container": new BooleanParameter({
    help: "Show the name of the container with log output. May not apply to all providers",
    defaultValue: false,
  }),
  "timestamps": new BooleanParameter({
    help: "Show timestamps with log output.",
  }),
  "since": new DurationParameter({
    help: dedent`
      Only show logs newer than a relative duration like 5s, 2m, or 3h. Defaults to \`"1m"\` when \`--follow\` is true
      unless \`--tail\` is set. Note that we don't recommend using a large value here when in follow mode.
    `,
  }),
  "original-color": new BooleanParameter({
    help: "Show the original color output of the logs instead of color coding them.",
    defaultValue: false,
  }),
  "hide-service": new BooleanParameter({
    help: "Hide the service name and render the logs directly.",
    defaultValue: false,
  }),
}

type Args = typeof logsArgs
type Opts = typeof logsOpts

export const colors = ["green", "cyan", "magenta", "yellow", "blueBright", "red"]

/**
 * Skip empty entries.
 */
function skipEntry(entry: ServiceLogEntry) {
  const validDate = entry.timestamp && entry.timestamp instanceof Date && !isNaN(entry.timestamp.getTime())
  return !entry.msg && !validDate
}

export class LogsCommand extends Command<Args, Opts> {
  name = "logs"
  help = "Retrieves the most recent logs for the specified service(s)."

  description = dedent`
    Outputs logs for all or specified services, and optionally waits for news logs to come in. Defaults
    to getting logs from the last minute when in \`--follow\` mode. You can change this with the \`--since\` option.

    Examples:

        garden logs                       # interleaves color-coded logs from all services (up to a certain limit)
        garden logs --since 2d            # interleaves color-coded logs from all services from the last 2 days
        garden logs --tail 100            # interleaves the last 100 log lines from all services
        garden logs service-a,service-b   # interleaves color-coded logs for service-a and service-b
        garden logs --follow              # keeps running and streams all incoming logs to the console
        garden logs --original-color      # interleaves logs from all services and prints the original output color
  `

  arguments = logsArgs
  options = logsOpts

  private events?: PluginEventBroker

  getLoggerType(): LoggerType {
    return "basic"
  }

  printHeader({ headerLog }) {
    printHeader(headerLog, "Logs", "scroll")
  }

  async prepare({ opts }: PrepareParams<Args, Opts>) {
    return { persistent: !!opts.follow }
  }

  terminate() {
    this.events?.emit("abort", {})
  }

  async action({ garden, log, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<ServiceLogEntry[]>> {
    const { follow, timestamps } = opts
    let tail = opts.tail as number | undefined
    let since = opts.since as string | undefined
    const originalColor = opts["original-color"]
    const showContainer = opts["show-container"]
    const hideService = opts["hide-service"]
    const logLevel = parseLogLevel(opts["log-level"])

    if (tail) {
      // Tail takes precedence over since...
      since = undefined
    } else if (follow && !since) {
      // ...but if tail is not set and we're in follow mode, we default to getting the most recent logs.
      since = "1m"
    }

    const graph = await garden.getConfigGraph(log)
    const allServices = graph.getServices()
    const services = args.services ? allServices.filter((s) => args.services?.includes(s.name)) : allServices

    // If the container name should be displayed, we align the output wrt to the longest container name
    let maxServiceName = 1
    let maxContainerName = 1

    const result: ServiceLogEntry[] = []
    const stream = new Stream<ServiceLogEntry>()
    let details: string = ""

    if (tail) {
      details = ` (showing last ${tail} lines from each service)`
    } else if (since) {
      details = ` (from the last '${since}' for each service)`
    }

    log.info("")
    log.info(chalk.white.bold("Service logs" + details + ":"))
    log.info(chalk.white.bold(renderDivider()))
    log.root.stop()

    // Map all service names in the project to a specific color. This ensures
    // that in most cases services have the same color (unless any have been added/removed),
    // regardless of what params you pass to the command.
    const allServiceNames = allServices
      .map((s) => s.name)
      .filter(Boolean)
      .sort()
    const colorMap = allServiceNames.reduce((acc, serviceName, idx) => {
      const color = colors[idx % colors.length]
      acc[serviceName] = color
      return acc
    }, {})

    const formatEntry = (entry: ServiceLogEntry) => {
      const style = chalk[colorMap[entry.serviceName]]
      const sectionStyle = style.bold
      const serviceLog = originalColor ? entry.msg : stripAnsi(entry.msg)
      const entryLevel = entry.level || LogLevel.info

      let timestamp: string | undefined
      let container: string | undefined

      if (timestamps && entry.timestamp) {
        timestamp = "                        "
        try {
          timestamp = entry.timestamp.toISOString()
        } catch {}
      }

      if (showContainer && entry.containerName) {
        container = entry.containerName
      }

      if (entryLevel <= logLevel) {
        maxServiceName = Math.max(maxServiceName, entry.serviceName.length)
        maxContainerName = container ? Math.max(maxContainerName, container.length) : maxContainerName
      }

      let out = ""
      if (!hideService) {
        out += `${sectionStyle(formatSection(entry.serviceName, maxServiceName))} → `
      }
      if (container) {
        out += `${sectionStyle(formatSection(container, maxContainerName))} → `
      }
      if (timestamp) {
        out += `${chalk.gray(timestamp)} → `
      }
      if (originalColor) {
        // If the line doesn't have ansi encoding, we color it white to prevent logger from applying styles.
        out += hasAnsi(serviceLog) ? serviceLog : chalk.white(serviceLog)
      } else {
        out += style(serviceLog)
      }

      return out
    }

    void stream.forEach((entry) => {
      // Skip empty entries
      if (skipEntry(entry)) {
        return
      }

      if (follow) {
        const levelStr = logLevelMap[entry.level || LogLevel.info] || "info"
        const msg = formatEntry(entry)
        this.emit(log, JSON.stringify({ msg, timestamp: entry.timestamp?.getTime(), level: levelStr }))
        log[levelStr]({ msg })
      } else {
        result.push(entry)
      }
    })

    const actions = await garden.getActionRouter()
    this.events = new PluginEventBroker()

    await Bluebird.map(services, async (service: GardenService<any>) => {
      await actions.getServiceLogs({ log, service, stream, follow, tail, since, events: this.events })
    })

    const sorted = sortBy(result, "timestamp")

    if (!follow) {
      for (const entry of sorted) {
        const levelStr = logLevelMap[entry.level || LogLevel.info] || "info"
        const msg = formatEntry(entry)
        log[levelStr]({ msg })
      }
    }

    return { result: sorted }
  }
}
