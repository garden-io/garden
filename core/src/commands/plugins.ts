/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { max, fromPairs, zip } from "lodash-es"
import { findByName } from "../util/util.js"
import { dedent, naturalList, renderTable, tablePresets } from "../util/string.js"
import { ParameterError, toGardenError } from "../exceptions.js"
import type { Log } from "../logger/log-entry.js"
import type { Garden } from "../garden.js"
import type { CommandResult, CommandParams } from "./base.js"
import { Command } from "./base.js"
import { printHeader, getTerminalWidth } from "../logger/util.js"
import { StringOption } from "../cli/params.js"
import { ConfigGraph } from "../graph/config-graph.js"
import { ModuleGraph } from "../graph/modules.js"
import { styles } from "../logger/styles.js"

const pluginArgs = {
  plugin: new StringOption({
    help: "The name of the plugin, whose command you wish to run.",
    required: false,
    getSuggestions: ({ configDump }) => {
      return configDump.allAvailablePlugins
    },
  }),
  command: new StringOption({
    help: "The name of the command to run.",
    required: false,
  }),
}

type Args = typeof pluginArgs

export class PluginsCommand extends Command<Args> {
  name = "plugins"
  help = "Plugin-specific commands."
  override aliases = ["plugin"]

  override description = dedent`
    Execute a command defined by a plugin in your project.
    Run without arguments to get a list of all plugin commands available.
    Run with just the plugin name to get a list of commands provided by that plugin.

    Examples:

        # Run the \`cleanup-cluster-registry\` command from the \`kubernetes\` plugin.
        garden plugins kubernetes cleanup-cluster-registry

        # List all available commands.
        garden plugins

        # List all the commands from the \`kubernetes\` plugin.
        garden plugins kubernetes
  `

  override arguments = pluginArgs

  override printHeader({ log }) {
    printHeader(log, "Plugins", "⚙️")
  }

  async action({ garden, log, args }: CommandParams<Args>): Promise<CommandResult> {
    const providerConfigs = garden.getUnresolvedProviderConfigs()
    const configuredPlugins = providerConfigs.map((p) => p.name)

    if (!args.command || !args.plugin) {
      // We're listing commands, not executing one
      const pluginsToList = (!!args.plugin ? [args.plugin] : configuredPlugins).sort()
      return listPlugins(garden, log, pluginsToList)
    }

    // We're executing a command
    const plugin = await garden.getPlugin(args.plugin)
    const command = findByName(plugin.commands, args.command)

    if (!command) {
      const availableCommands = plugin.commands.map((c) => c.name)
      return {
        errors: [
          new ParameterError({
            message: dedent`
              Could not find command '${args.command}' on plugin ${args.plugin}${
                availableCommands ? `\n\nAvailable commands: ${naturalList(availableCommands)}` : ""
              }`,
          }),
        ],
      }
    }

    const commandArgs = args["--"] || []

    if (command.title) {
      const environmentName = garden.environmentName
      const title =
        typeof command.title === "function"
          ? await command.title({ args: commandArgs, environmentName })
          : command.title
      printHeader(log, title, "⚙️")
    }

    const provider = await garden.resolveProvider({ log, name: args.plugin })
    const ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })

    let graph = new ConfigGraph({
      environmentName: garden.environmentName,
      actions: [],
      moduleGraph: new ModuleGraph({ modules: [], moduleTypes: {} }),
      groups: [],
      excludeValuesFromActionVersions: await garden.getExcludeValuesForActionVersions(),
    })

    // Commands can optionally ask for all the modules in the project/environment
    if (command.resolveGraph) {
      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    }

    log.info("")

    try {
      const { result, errors = [] } = await command.handler({ garden, ctx, log, args: commandArgs, graph })
      return { result, errors: errors.map(toGardenError) }
    } catch (err) {
      return { errors: [toGardenError(err)] }
    }
  }
}

async function listPlugins(garden: Garden, log: Log, pluginsToList: string[]) {
  log.info(dedent`
  ${styles.accent.bold("USAGE")}

    garden ${styles.warning("[global options]")} ${styles.command("<command>")} -- ${styles.accent("[args ...]")}

  ${styles.accent.bold("PLUGIN COMMANDS")}
  `)

  const plugins = await Promise.all(
    pluginsToList.map(async (pluginName) => {
      const plugin = await garden.getPlugin(pluginName)

      const commands = plugin.commands
      if (commands.length === 0) {
        return plugin
      }

      const rows = commands.map((command) => {
        return [` ${styles.highlight(pluginName + " " + command.name)}`, command.description]
      })

      const maxCommandLengthAnsi = max(rows.map((r) => r[0].length))!

      log.info(
        renderTable(rows, {
          ...tablePresets["no-borders"],
          colWidths: [null, getTerminalWidth() - maxCommandLengthAnsi],
        })
      )

      // Line between different plugins
      log.info("")

      return plugin
    })
  )

  const result = fromPairs(zip(pluginsToList, plugins))
  return { result }
}
