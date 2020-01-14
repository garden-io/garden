/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { max, padEnd, fromPairs, zip } from "lodash"
import { findByName } from "../util/util"
import { dedent } from "../util/string"
import { ParameterError, toGardenError } from "../exceptions"
import { LogEntry } from "../logger/log-entry"
import { Garden } from "../garden"
import { Command, CommandResult, CommandParams, StringParameter } from "./base"
import Bluebird from "bluebird"
import { printHeader } from "../logger/util"

const pluginArgs = {
  plugin: new StringParameter({
    help: "The name of the plugin, whose command you wish to run.",
    required: false,
  }),
  command: new StringParameter({
    help: "The name of the command to run.",
    required: false,
  }),
}

type Args = typeof pluginArgs

export class PluginsCommand extends Command<Args> {
  name = "plugins"
  help = "Plugin-specific commands."

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

  async action({ garden, log, args }: CommandParams<Args>): Promise<CommandResult> {
    const providerConfigs = garden.getRawProviderConfigs()
    const configuredPlugins = providerConfigs.map((p) => p.name)

    if (!args.command) {
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
            availableCommands: (plugin.commands).map((c) => c.name),
          }),
        ],
      }
    }

    if (command.title) {
      const environmentName = garden.environmentName
      const title = typeof command.title === "function" ? await command.title({ environmentName }) : command.title
      printHeader(log, title, "gear")
    }

    const provider = await garden.resolveProvider(args.plugin)
    const ctx = garden.getPluginContext(provider)

    try {
      const { result, errors = [] } = await command.handler({ ctx, log })
      return { result, errors: errors.map(toGardenError) }
    } catch (err) {
      return { errors: [toGardenError(err)] }
    }
  }
}

async function listPlugins(garden: Garden, log: LogEntry, pluginsToList: string[]) {
  log.info(chalk.white.bold("PLUGIN COMMANDS"))

  const plugins = await Bluebird.map(pluginsToList, async (pluginName) => {
    const plugin = await garden.getPlugin(pluginName)

    const commands = plugin.commands
    if (commands.length === 0) {
      return plugin
    }

    const maxNameLength = max(commands.map((c) => c.name.length))!

    for (const command of commands) {
      const commandName = chalk.cyan(padEnd(command.name, maxNameLength, " "))
      log.info(`  ${chalk.cyan(pluginName)} ${commandName}  ${command.description}`)
    }

    // Line between different plugins
    log.info("")

    return plugin
  })

  const result = fromPairs(zip(pluginsToList, plugins))
  return { result }
}
