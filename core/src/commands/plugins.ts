/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { max, fromPairs, zip } from "lodash"
import { findByName, getNames } from "../util/util"
import { dedent, naturalList, renderTable, tablePresets } from "../util/string"
import { ChildProcessError, ParameterError, toGardenError } from "../exceptions"
import { Log } from "../logger/log-entry"
import { Garden } from "../garden"
import { Command, CommandResult, CommandParams } from "./base"
import { printHeader, getTerminalWidth } from "../logger/util"
import { StringOption } from "../cli/params"
import { ConfigGraph } from "../graph/config-graph"
import { ModuleGraph } from "../graph/modules"

const pluginArgs = {
  plugin: new StringOption({
    help: "The name of the plugin, whose command you wish to run.",
    required: false,
    getSuggestions: ({ configDump }) => {
      return getNames(configDump.providers)
    },
  }),
  command: new StringOption({
    help: "The name of the command to run.",
    required: false,
  }),
}

const pluginOpts = {
  cwd: new StringOption({
    help: "Set the working directory to run from.",
    required: false,
  }),
}

type Args = typeof pluginArgs
type Opts = typeof pluginOpts

export class PluginsCommand extends Command<Args, Opts> {
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
  override options = pluginOpts

  override printHeader({ log }) {
    printHeader(log, "Plugins", "⚙️")
  }

  async action({ garden, log, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult> {
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

    const provider = await garden.resolveProvider(log, args.plugin)
    const ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })

    let graph = new ConfigGraph({ actions: [], moduleGraph: new ModuleGraph([], {}), groups: [] })

    // Commands can optionally ask for all the modules in the project/environment
    if (command.resolveGraph) {
      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    }

    log.info("")

    try {
      const {
        result,
        exitCode,
        errors = [],
      } = await command.handler({ garden, ctx, log, args: commandArgs, graph, cwd: opts.cwd })
      return { result, exitCode, errors: errors.map(toGardenError) }
    } catch (err) {
      if (err instanceof ChildProcessError) {
        return { exitCode: err.details.code, errors: [toGardenError(err)] }
      } else {
        return { exitCode: 1, errors: [toGardenError(err)] }
      }
    }
  }
}

async function listPlugins(garden: Garden, log: Log, pluginsToList: string[]) {
  log.info(dedent`
  ${chalk.white.bold("USAGE")}

    garden ${chalk.yellow("[global options]")} ${chalk.blueBright("<command>")} -- ${chalk.white("[args ...]")}

  ${chalk.white.bold("PLUGIN COMMANDS")}
  `)

  const plugins = await Promise.all(
    pluginsToList.map(async (pluginName) => {
      const plugin = await garden.getPlugin(pluginName)

      const commands = plugin.commands
      if (commands.length === 0) {
        return plugin
      }

      const rows = commands.map((command) => {
        return [` ${chalk.cyan(pluginName + " " + command.name)}`, command.description]
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
