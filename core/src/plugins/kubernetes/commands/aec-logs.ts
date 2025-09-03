/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { KubernetesPluginContext } from "../config.js"
import type { PluginCommand } from "../../../plugin/command.js"
import { dedent, splitLines } from "../../../util/string.js"
import minimist from "minimist"
import { getSystemNamespace } from "../namespace.js"
import { getAecAgentManifests } from "../aec.js"
import type { KubernetesResource } from "../types.js"
import { streamK8sLogs } from "../logs.js"
import chalk from "chalk"

interface Result {
  manifests?: KubernetesResource[]
}

export const aecLogsCommand: PluginCommand = {
  name: "aec-logs",
  description: dedent`
    Print the logs from the Automatic Environment Cleanup (AEC) agent.

    Run with \`-- --follow\` to stream logs continuously.
  `,
  title: `Print the logs from the Automatic Environment Cleanup (AEC) agent.`,
  resolveGraph: false,

  handler: async ({ ctx, log, args }) => {
    const result: Result = {}
    const k8sCtx = ctx as KubernetesPluginContext
    const provider = k8sCtx.provider

    // Parse args with minimist
    const opts = minimist(args, {
      boolean: ["follow"],
    })

    const systemNamespace = await getSystemNamespace(ctx, provider, log)

    const manifests = getAecAgentManifests({
      imageOverride: undefined,
      systemNamespace,
      localDevMode: false,
      // Won't be used
      serviceAccessToken: "foo",
      description: "foo",
      cloudDomain: "foo.example.com",
      organizationId: "foo",
    }).filter((m) => m.kind === "Deployment")

    await streamK8sLogs({
      log,
      ctx,
      provider,
      actionName: "aec-agent",
      onLogEntry: (entry) => {
        const lines = splitLines(entry.msg)
        for (let line of lines) {
          const lineEntry = { ...entry }
          // Detect ISO date string at the start of the line, trim if it's there
          const dateMatch = line.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z/)
          if (dateMatch) {
            line = line.slice(dateMatch[0].length + 1)
          }
          if (entry.timestamp) {
            lineEntry.msg = chalk.gray(`[${entry.timestamp.toISOString()}]`) + "  " + chalk.white(line)
            lineEntry.timestamp = undefined
          } else {
            lineEntry.msg = line
          }
          log.info(lineEntry)
        }
      },
      defaultNamespace: systemNamespace,
      follow: opts.follow,
      resources: manifests,
    })

    log.success("\nDone!")

    return { result }
  },
}
