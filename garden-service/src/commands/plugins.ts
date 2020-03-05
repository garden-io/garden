/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { max, fromPairs, zip, omit } from "lodash"
import { findByName } from "../util/util"
import { dedent, renderTable, tablePresets } from "../util/string"
import { ParameterError, toGardenError } from "../exceptions"
import { LogEntry } from "../logger/log-entry"
import { Garden } from "../garden"
import { Command, CommandResult, CommandParams, StringOption } from "./base"
import Bluebird from "bluebird"
import { printHeader, getTerminalWidth } from "../logger/util"
import { LoggerType } from "../logger/logger"
import { Module } from "../types/module"

const pluginArgs = {
  plugin: new StringOption({
    help: "The name of the plugin, whose command you wish to run.",
    required: false,
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

  // FIXME: We need this while we're still resolving providers in the AnalyticsHandler
  noProject = true
  loggerType = <LoggerType>"basic"

  description = dedent`
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

  arguments = pluginArgs

  async action({ garden: dummyGarden, log, args }: CommandParams<Args>): Promise<CommandResult> {
    // FIXME: We need this while we're still resolving providers in the AnalyticsHandler
    const garden = await Garden.factory(dummyGarden.projectRoot, { ...omit(dummyGarden.opts, "config"), log })

    const providerConfigs = garden.getRawProviderConfigs()
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
      return {
        errors: [
          new ParameterError(`Could not find command '${args.command}' on plugin ${args.plugin}`, {
            args,
            availableCommands: plugin.commands.map((c) => c.name),
          }),
        ],
      }
    }

    const commandArgs = args._ || []

    if (command.title) {
      const environmentName = garden.environmentName
      const title =
        typeof command.title === "function"
          ? await command.title({ args: commandArgs, environmentName })
          : command.title
      printHeader(log, title, "gear")
    }

    const provider = await garden.resolveProvider(args.plugin)
    const ctx = garden.getPluginContext(provider)

    let modules: Module[] = []

    // Commands can optionally ask for all the modules in the project/environment
    if (command.resolveModules) {
      const graph = await garden.getConfigGraph(garden.log)
      modules = await graph.getModules()
    }

    log.info("")

    try {
      const { result, errors = [] } = await command.handler({ ctx, log, args: commandArgs, modules })
      return { result, errors: errors.map(toGardenError) }
    } catch (err) {
      return { errors: [toGardenError(err)] }
    }
  }
}

async function listPlugins(garden: Garden, log: LogEntry, pluginsToList: string[]) {
  log.info(dedent`
  ${chalk.white.bold("USAGE")}

    garden ${chalk.yellow("[global options]")} ${chalk.blueBright("<command>")} ${chalk.white("[args ...]")}

  ${chalk.white.bold("PLUGIN COMMANDS")}
  `)

  const plugins = await Bluebird.map(pluginsToList, async (pluginName) => {
    const plugin = await garden.getPlugin(pluginName)

    const commands = plugin.commands
    if (commands.length === 0) {
      return plugin
    }

    const rows = commands.map((command) => {
      return [` ${chalk.cyan(pluginName + " " + command.name)}`, command.description]
    })

    const maxCommandLength = max(rows.map((r) => r[0].length))!

    log.info(
      renderTable(rows, {
        ...tablePresets["no-borders"],
        colWidths: [null, getTerminalWidth() - maxCommandLength],
      })
    )

    // Line between different plugins
    log.info("")

    return plugin
  })

  const result = fromPairs(zip(pluginsToList, plugins))
  return { result }
}
