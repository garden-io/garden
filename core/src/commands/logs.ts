/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dotenv = require("dotenv")
import { Command, CommandResult, CommandParams, PrepareParams } from "./base"
import chalk from "chalk"
import { every, some, sortBy } from "lodash"
import Bluebird = require("bluebird")
import { DeployLogEntry } from "../types/service"
import Stream from "ts-stream"
import { LoggerType, logLevelMap, LogLevel, parseLogLevel } from "../logger/logger"
import { StringsParameter, BooleanParameter, IntegerParameter, DurationParameter, TagsOption } from "../cli/params"
import { printHeader, renderDivider } from "../logger/util"
import hasAnsi = require("has-ansi")
import { dedent, deline } from "../util/string"
import { padSection } from "../logger/renderers"
import { PluginEventBroker } from "../plugin-context"
import { ParameterError } from "../exceptions"

const logsArgs = {
  names: new StringsParameter({
    help:
      "The name(s) of the deploy(s) to log (skip to get logs from all deploys in the project). " +
      "Use comma as a separator to specify multiple names.",
  }),
}

const logsOpts = {
  "tag": new TagsOption({
    help: deline`
      Only show log lines that match the given tag, e.g. \`--tag 'container=foo'\`. If you specify multiple filters
      in a single tag option (e.g. \`--tag 'container=foo,someOtherTag=bar'\`), they must all be matched. If you
      provide multiple \`--tag\` options (e.g. \`--tag 'container=api' --tag 'container=frontend'\`), they will be OR-ed
      together (i.e. if any of them match, the log line will be included). You can specify glob-style wildcards, e.g.
      \`--tag 'container=prefix-*'\`.
    `,
  }),
  "follow": new BooleanParameter({
    help: "Continuously stream new logs.",
    alias: "f",
  }),
  "tail": new IntegerParameter({
    help: deline`
      Number of lines to show for each deployment. Defaults to showing all log lines (up to a certain limit). Takes precedence over
      the \`--since\` flag if both are set. Note that we don't recommend using a large value here when in follow mode.
    `,
    alias: "t",
  }),
  "show-tags": new BooleanParameter({
    help: "Show any tags attached to each log line. May not apply to all providers",
    defaultValue: false,
  }),
  "timestamps": new BooleanParameter({
    help: "Show timestamps with log output.",
  }),
  "since": new DurationParameter({
    help: deline`
      Only show logs newer than a relative duration like 5s, 2m, or 3h. Defaults to \`"1m"\` when \`--follow\` is true
      unless \`--tail\` is set. Note that we don't recommend using a large value here when in follow mode.
    `,
  }),
  "hide-name": new BooleanParameter({
    help: "Hide the action name and render the logs directly.",
    alias: "hide-service",
    defaultValue: false,
  }),
}

type Args = typeof logsArgs
type Opts = typeof logsOpts

export const colors = ["green", "cyan", "magenta", "yellow", "blueBright", "red"]

type LogsTagFilter = [string, string]
type LogsTagAndFilter = LogsTagFilter[]
type LogsTagOrFilter = LogsTagAndFilter[]

/**
 * Skip empty entries.
 */
function skipEntry(entry: DeployLogEntry) {
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

        garden logs                            # interleaves color-coded logs from all services (up to a certain limit)
        garden logs --since 2d                 # interleaves color-coded logs from all services from the last 2 days
        garden logs --tail 100                 # interleaves the last 100 log lines from all services
        garden logs service-a,service-b        # interleaves color-coded logs for service-a and service-b
        garden logs --follow                   # keeps running and streams all incoming logs to the console
        garden logs --tag container=service-a  # only shows logs from containers with names matching the pattern
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

  isPersistent({ opts }: PrepareParams<Args, Opts>) {
    return !!opts.follow
  }

  terminate() {
    this.events?.emit("abort")
  }

  async action({ garden, log, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<DeployLogEntry[]>> {
    const { follow, timestamps, tag } = opts
    let tail = opts.tail as number | undefined
    let since = opts.since as string | undefined
    const showTags = opts["show-tags"]
    const hideService = opts["hide-name"]
    const logLevel = parseLogLevel(opts["log-level"])

    let tagFilters: LogsTagOrFilter | undefined = undefined

    if (tail !== undefined) {
      // Tail takes precedence over since...
      since = undefined
    } else if (follow && !since) {
      // ...but if tail is not set and we're in follow mode, we default to getting the most recent logs.
      since = "1m"
    }

    if (tag && tag.length > 0) {
      const parameterErrorMsg = "Unable to parse the given --tag flags. Format should be key=value."
      try {
        tagFilters = tag.map((tagGroup: string) => tagGroup.split(",").map((t: string) => {
            const parsed = Object.entries(dotenv.parse(t))[0]
            if (!parsed) {
              throw new ParameterError(parameterErrorMsg, { tags: tag })
            }
            return parsed
          }))
      } catch {
        throw new ParameterError(parameterErrorMsg, { tags: tag })
      }
    }

    const graph = await garden.getConfigGraph({ log, emit: false })
    const allDeploys = graph.getDeploys()
    const actions = args.names ? allDeploys.filter((s) => args.names?.includes(s.name)) : allDeploys

    // If the container name should be displayed, we align the output wrt to the longest container name
    let maxDeployName = 1

    const result: DeployLogEntry[] = []
    const stream = new Stream<DeployLogEntry>()
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

    // Map all deploys names in the project to a specific color. This ensures
    // that in most cases they have the same color (unless any have been added/removed),
    // regardless of what params you pass to the command.
    const allDeployNames = allDeploys
      .map((s) => s.name)
      .filter(Boolean)
      .sort()
    const colorMap = allDeployNames.reduce((acc, name, idx) => {
      const color = colors[idx % colors.length]
      acc[name] = color
      return acc
    }, {})

    // Note: lazy-loading for startup performance
    const { isMatch } = require("micromatch")

    const matchTagFilters = (entry: DeployLogEntry): boolean => {
      if (!tagFilters) {
        return true
      }
      // We OR together the filter results of each tag option instance.
      return some(tagFilters, (andFilter: LogsTagAndFilter) =>
        // We AND together the filter results within a given tag option instance.
         every(andFilter, ([key, value]: LogsTagFilter) => isMatch(entry.tags?.[key] || "", value))
      )
    }

    const formatEntry = (entry: DeployLogEntry) => {
      const style = chalk[colorMap[entry.name]]
      const sectionStyle = style.bold
      const serviceLog = entry.msg
      const entryLevel = entry.level || LogLevel.info

      let timestamp: string | undefined
      let tags: string | undefined

      if (timestamps && entry.timestamp) {
        timestamp = "                        "
        try {
          timestamp = entry.timestamp.toISOString()
        } catch {}
      }

      if (showTags && entry.tags) {
        tags = Object.entries(entry.tags)
          .map(([k, v]) => `${k}=${v}`)
          .join(" ")
      }

      if (entryLevel <= logLevel) {
        maxDeployName = Math.max(maxDeployName, entry.name.length)
      }

      let out = ""
      if (!hideService) {
        out += `${sectionStyle(padSection(entry.name, maxDeployName))} → `
      }
      if (timestamp) {
        out += `${chalk.gray(timestamp)} → `
      }
      if (tags) {
        out += chalk.gray("[" + tags + "] ")
      }
      // If the line doesn't have ansi encoding, we color it white to prevent logger from applying styles.
      out += hasAnsi(serviceLog) ? serviceLog : chalk.white(serviceLog)

      return out
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

      if (follow) {
        const levelStr = logLevelMap[entry.level || LogLevel.info] || "info"
        const msg = formatEntry(entry)
        this.emit(log, JSON.stringify({ msg, timestamp: entry.timestamp?.getTime(), level: levelStr }))
        log[levelStr]({ msg })
      } else {
        result.push(entry)
      }
    })

    const router = await garden.getActionRouter()
    this.events = new PluginEventBroker()

    const resolvedActions = await garden.resolveActions({ actions, graph, log })

    await Bluebird.map(Object.values(resolvedActions), async (action) => {
      await router.deploy.getLogs({ log, graph, action, stream, follow, tail, since, events: this.events })
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
