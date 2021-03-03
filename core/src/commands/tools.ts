/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { max, omit, sortBy } from "lodash"
import { dedent, renderTable, tablePresets } from "../util/string"
import { LogEntry } from "../logger/log-entry"
import { Garden, DummyGarden } from "../garden"
import { Command, CommandParams } from "./base"
import { getTerminalWidth } from "../logger/util"
import { LoggerType } from "../logger/logger"
import { ParameterError } from "../exceptions"
import { uniqByName, exec, shutdown } from "../util/util"
import { PluginTool } from "../util/ext-tools"
import { findProjectConfig } from "../config/base"
import { StringOption, BooleanParameter } from "../cli/params"

const toolsArgs = {
  tool: new StringOption({
    help: "The name of the tool to run.",
    required: false,
  }),
}

const toolsOpts = {
  "get-path": new BooleanParameter({
    help: "If specified, we print the path to the binary or library instead of running it.",
    required: false,
  }),
}

type Args = typeof toolsArgs
type Opts = typeof toolsOpts

export class ToolsCommand extends Command<Args, Opts> {
  name = "tools"
  help = "Access tools included by providers."
  cliOnly = true

  noProject = true

  description = dedent`
    Run a tool defined by a provider in your project, downloading and extracting it if necessary. Run without arguments to get a list of all tools available.

    Run with the --get-path flag to just print the path to the binary or library directory (depending on the tool type). If the tool is a non-executable library, this flag is implicit.

    When multiple plugins provide a tool with the same name, you can choose a specific plugin/version by specifying <plugin name>.<tool name>, instead of just <tool name>. This is generally advisable when using this command in scripts, to avoid accidental conflicts.

    When there are name conflicts and a plugin name is not specified, we first prefer tools defined by configured providers in the current project (if applicable), and then alphabetical by plugin name.

    Examples:

        # Run kubectl with <args>.
        garden tools kubectl -- <args>

        # Run the kubectl version defined specifically by the \`kubernetes\` plugin.
        garden tools kubernetes.kubectl -- <args>

        # Print the path to the kubernetes.kubectl tool to stdout, instead of running it.
        garden tools kubernetes.kubectl --get-path

        # List all available tools.
        garden tools
  `

  arguments = toolsArgs
  options = toolsOpts

  getLoggerType(): LoggerType {
    return "basic"
  }

  printHeader() {}

  async prepare({ log }) {
    // Override the logger output, to output to stderr instead of stdout, to avoid contaminating command output
    const basicWriter = log.root.writers.find((w) => w.type === "basic")
    if (basicWriter) {
      basicWriter.output = process.stderr
    }
    return { persistent: false }
  }

  async action({ garden, log, args, opts }: CommandParams<Args>) {
    const tools = await getTools(garden)

    if (!args.tool) {
      // We're listing tools, not executing one
      return printTools(garden, log)
    }

    let pluginName: string | null = null
    let toolName: string

    const split = args.tool.split(".")

    if (split.length === 1) {
      toolName = args.tool
    } else if (split.length === 2) {
      pluginName = split[0]
      toolName = split[1]
    } else {
      throw new ParameterError(
        `Invalid tool name argument. Please specify either a tool name (no periods) or <plugin name>.<tool name>.`,
        { args }
      )
    }

    // We're executing a tool
    const availablePlugins = await garden.getAllPlugins()
    let plugins = availablePlugins

    if (pluginName) {
      plugins = plugins.filter((p) => p.name === pluginName)

      if (plugins.length === 0) {
        throw new ParameterError(`Could not find plugin ${pluginName}.`, { availablePlugins })
      }
    } else {
      // Place configured providers at the top for preference, if applicable
      const projectRoot = await findProjectConfig(garden.projectRoot)

      if (projectRoot) {
        // This will normally be the case, but we're checking explictly to accommodate testing
        if (garden instanceof DummyGarden) {
          try {
            garden = await Garden.factory(garden.projectRoot, { ...omit(garden.opts, "config"), log })
          } catch (err) {
            // We don't want to fail here due to incorrect parameters etc.
            log.debug(`Unable to resolve project config: ${err.message}`)
          }
        }
        const configuredPlugins = await garden.getAllPlugins()
        plugins = uniqByName([...configuredPlugins, ...availablePlugins])
      }
    }

    const matchedTools = sortBy(plugins, "name")
      .flatMap((plugin) => (plugin.tools || []).map((tool) => ({ plugin, tool })))
      .filter(({ tool }) => tool.name === toolName)

    const matchedNames = matchedTools.map(({ plugin, tool }) => `${plugin.name}.${tool.name}`)

    if (matchedTools.length === 0) {
      throw new ParameterError(`Could not find tool ${args.tool}.`, { args })
    }

    if (matchedTools.length > 1) {
      log.warn(chalk.yellow(`Multiple tools matched (${matchedNames.join(", ")}). Running ${matchedNames[0]}`))
    }

    const toolCls = new PluginTool(matchedTools[0].tool)
    const path = await toolCls.getPath(log)

    // We just output the path if --get-path is set, or if the tool is a library
    if (opts["get-path"] || toolCls.type === "library") {
      process.stdout.write(path + "\n")
      return { result: { tools, path, exitCode: undefined, stdout: undefined, stderr: undefined } }
    }

    // We're running a binary
    if (opts.output) {
      // We collect the output and return
      const result = await exec(path, args._ || [], { reject: false })
      return { result: { tools, path, stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode } }
    } else {
      // We attach stdout and stderr directly, and exit with the same code as we get from the command
      log.stop()
      const result = await exec(path, args._ || [], { reject: false, stdio: "inherit" })
      await shutdown(result.exitCode)
      // Note: We never reach this line, just putting it here for the type-checker
      return { result: { tools, path, stdout: "", stderr: "", exitCode: result.exitCode } }
    }
  }
}

async function getTools(garden: Garden) {
  const registeredPlugins = await garden.getAllPlugins()

  return sortBy(registeredPlugins, "name").flatMap((plugin) =>
    (plugin.tools || []).map((tool) => ({ ...omit(tool, "_includeInGardenImage"), pluginName: plugin.name }))
  )
}

async function printTools(garden: Garden, log: LogEntry) {
  log.info(dedent`
  ${chalk.white.bold("USAGE")}

    garden ${chalk.yellow("[global options]")} ${chalk.blueBright("<tool>")} -- ${chalk.white("[args ...]")}
    garden ${chalk.yellow("[global options]")} ${chalk.blueBright("<tool>")} --get-path

  ${chalk.white.bold("PLUGIN TOOLS")}
  `)

  const tools = await getTools(garden)

  const rows = tools.map((tool) => {
    return [
      ` ${chalk.cyan(tool.pluginName + ".")}${chalk.cyan.bold(tool.name)}`,
      chalk.gray(`[${tool.type}]`),
      tool.description,
    ]
  })

  const maxRowLength = max(rows.map((r) => r[0].length))!

  log.info(
    renderTable(rows, {
      ...tablePresets["no-borders"],
      colWidths: [null, null, getTerminalWidth() - maxRowLength - 2],
    })
  )

  log.info("")

  return { result: { tools, exitCode: undefined, stdout: undefined, stderr: undefined, path: undefined } }
}
