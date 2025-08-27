/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CommandResult, CommandParams, PrepareParams } from "./base.js"
import { Command } from "./base.js"
import { omit, sortBy } from "lodash-es"
import type { DeployLogEntry } from "../types/service.js"
import { LogLevel, parseLogLevel, VoidLogger } from "../logger/logger.js"
import { StringsParameter, BooleanParameter, IntegerParameter, DurationParameter, TagsOption } from "../cli/params.js"
import { printHeader, renderDivider } from "../logger/util.js"
import { dedent, deline, naturalList } from "../util/string.js"
import { CommandError } from "../exceptions.js"
import type { LogsTagOrFilter } from "../monitors/logs.js"
import { LogMonitor } from "../monitors/logs.js"
import { styles } from "../logger/styles.js"

const logsArgs = {
  names: new StringsParameter({
    help:
      "The name(s) of the Deploy(s) to log (skip to get logs from all Deploys in the project). " +
      "You may specify multiple names, separated by spaces.",
    spread: true,
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.actionConfigs.Deploy)
    },
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
    help: deline`
      Continuously stream new logs.
      When the \`--follow\` option is set, we default to \`--since 1m\`.`,
    aliases: ["f"],
  }),
  "tail": new IntegerParameter({
    help: deline`
      Number of lines to show for each deployment. Defaults to showing all log lines (up to a certain limit). Takes precedence over
      the \`--since\` flag if both are set. Note that we don't recommend using a large value here when in follow mode.
    `,
    aliases: ["t"],
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
    aliases: ["hide-service"],
    defaultValue: false,
  }),
}

type Args = typeof logsArgs
type Opts = typeof logsOpts

export class LogsCommand extends Command<Args, Opts> {
  name = "logs"
  help = "Retrieves the most recent logs for the specified Deploy(s)."

  override description = dedent`
    Outputs logs for all or specified Deploys, and optionally waits for new logs to come in.
    Defaults to getting logs from the last minute when in \`--follow\` mode. You can change this with the \`--since\` or \`--tail\` options.

    Examples:

        garden logs                            # interleaves color-coded logs from all Deploys (up to a certain limit)
        garden logs --since 2d                 # interleaves color-coded logs from all Deploys from the last 2 days
        garden logs --tail 100                 # interleaves the last 100 log lines from all Deploys
        garden logs deploy-a,deploy-b          # interleaves color-coded logs for deploy-a and deploy-b
        garden logs --follow                   # keeps running and streams all incoming logs to the console
        garden logs --tag container=service-a  # only shows logs from containers with names matching the pattern
  `

  override arguments = logsArgs
  override options = logsOpts

  override printHeader({ log }) {
    printHeader(log, "Logs", "📜")
  }

  override getServerLogger() {
    // We don't want to log anything when called via the server.
    // Note that the level doesn't really matter here since the void logger doesn't log anything
    return new VoidLogger({ level: LogLevel.info })
  }

  override maybePersistent({ opts }: PrepareParams<Args, Opts>) {
    return !!opts.follow
  }

  async action({ garden, log, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<DeployLogEntry[]>> {
    const { follow, tag } = opts

    const tail = opts.tail as number | undefined
    let since = opts.since as string | undefined

    const showTags = opts["show-tags"]
    const hideService = opts["hide-name"]
    const logLevel = parseLogLevel(opts["log-level"])

    let tagFilters: LogsTagOrFilter | undefined = undefined

    if (tail || tail === 0) {
      // Tail takes precedence over since...
      since = undefined
    } else if (follow && !since) {
      // ...but if tail is not set and we're in follow mode, we default to getting the most recent logs.
      since = "1m"
    }

    if (tag && tag.length > 0) {
      tagFilters = tag.map((group) => group.map((t) => [t.key, t.value]))
    }

    const graph = await garden.getConfigGraph({ log, emit: false, statusOnly: true })
    const allDeploys = graph.getDeploys()
    const actions = args.names ? allDeploys.filter((s) => args.names?.includes(s.name)) : allDeploys

    if (actions.length === 0) {
      let msg: string
      if (args.names) {
        msg = `Deploy(s) ${naturalList(args.names.map((s) => `"${s}"`))} not found. Available Deploys: ${naturalList(
          allDeploys.map((s) => `"${s.name}"`).sort()
        )}.`
      } else {
        msg = "No Deploys found in project."
      }
      throw new CommandError({ message: msg })
    }

    let details = ""

    if (tail) {
      details = ` (showing last ${tail} lines from each service)`
    } else if (since) {
      details = ` (from the last '${since}' for each service)`
    }

    const style = styles.accent
    log.info("")
    log.info(style("Service logs" + details + ":"))
    log.info(renderDivider({ color: style }))

    const resolvedActions = await garden.resolveActions({ actions, graph, log })

    const monitors = Object.values(resolvedActions).map((action) => {
      return new LogMonitor({
        garden,
        log,
        action,
        graph,
        collect: !follow,
        hideService,
        showTags,
        showTimestamps: opts.timestamps,
        logLevel,
        tagFilters,
        tail,
        since,
      })
    })

    if (follow) {
      monitors.forEach((m) => garden.monitors.addAndSubscribe(m, this))
      return { result: [] }
    } else {
      const entries = await Promise.all(
        monitors.map(async (m) => {
          await m.start()
          return m.getEntries().map((e) => ({ ...e, monitor: m }))
        })
      )

      const sorted = sortBy(
        entries.flatMap((e) => e),
        "timestamp"
      )

      sorted.forEach((entry) => {
        entry.monitor.logEntry(entry)
      })

      log.info(renderDivider({ color: style }))

      return {
        result: sorted.map((e) => omit(e, "monitor")),
      }
    }
  }
}
