/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ConsoleCommand, PrepareParams } from "./base"
import { Command, CommandResult, CommandParams } from "./base"
import { GardenServer, startServer } from "../server/server"
import { Parameters, IntegerParameter, ChoicesParameter, StringParameter, StringsParameter } from "../cli/params"
import { printHeader } from "../logger/util"
import { Garden } from "../garden"
import { dedent, naturalList } from "../util/string"
import { getLogLevelChoices, LogLevel } from "../logger/logger"
import { flattenCommands, getBuiltinCommands } from "./commands"
import { getCustomCommands } from "./custom"
import { Log } from "../logger/log-entry"
import { CommandLine } from "../cli/command-line"
import { Autocompleter, AutocompleteSuggestion } from "../cli/autocomplete"
import chalk from "chalk"
import { isMatch } from "micromatch"

export const defaultServerPort = 9700

export const serveArgs: Parameters = {}

export const serveOpts = {
  port: new IntegerParameter({
    help: `The port number for the server to listen on.`,
    defaultValue: defaultServerPort,
  }),
}

export type ServeCommandArgs = typeof serveArgs
export type ServeCommandOpts = typeof serveOpts

export class ServeCommand<
  A extends ServeCommandArgs = ServeCommandArgs,
  O extends ServeCommandOpts = ServeCommandOpts,
  R = any
> extends Command<A, O, R> {
  name = "serve"
  aliases = ["dashboard"]
  help = "Starts the Garden Core API server for the current project and environment."

  cliOnly = true
  streamEvents = true
  hidden = true

  public server?: GardenServer
  protected garden?: Garden
  protected autocompleter: Autocompleter
  protected commandLine?: CommandLine

  description = dedent`
    Starts the Garden Core API server for the current project, and your selected environment+namespace.

    Note: You must currently run one server per environment and namespace.
  `

  arguments = <A>serveArgs
  options = <O>serveOpts

  printHeader({ headerLog }) {
    printHeader(headerLog, "Server", "📊")
  }

  terminate() {
    super.terminate()
    // Note: This will stop monitors. The CLI wrapper will wait for those to halt.
    this.garden?.events.emit("_exit", {})
    this.server?.close().catch(() => {})
  }

  maybePersistent() {
    return true
  }

  allowInDevCommand() {
    return false
  }

  async prepare({ log, footerLog, opts }: PrepareParams<ServeCommandArgs, ServeCommandOpts>) {
    this.server = await startServer({ log: footerLog, command: this, port: opts.port })

    // Print nicer error message when address is not available
    process.on("uncaughtException", (err: any) => {
      if (err.errno === "EADDRINUSE" && err.port === opts.port) {
        log.error({
          msg: dedent`
          Port ${opts.port} is already in use, possibly by another Garden server process.
          Either terminate the other process, or choose another port using the --port parameter.
          `,
        })
      } else {
        footerLog.error({ msg: err.message })
      }
      process.exit(1)
    })
  }

  async action({ garden, log }: CommandParams<A, O>): Promise<CommandResult<R>> {
    this.garden = garden
    const loggedIn = this.garden?.isLoggedIn()
    if (!loggedIn) {
      garden.emitWarning({
        key: "local-dashboard-removed",
        log,
        message: chalk.yellow(
          "The local dashboard has been removed. To use the new Garden Cloud Dashboard, please log in first."
        ),
      })
    }

    this.autocompleter = new Autocompleter({ log, commands: [], configDump: undefined })

    return new Promise((resolve, reject) => {
      this.server!.on("close", () => {
        resolve({})
      })

      this.server!.on("error", () => {
        reject({})
      })

      // Errors are handled in the method
      this.reload(log, garden)
        .then(() => {
          this.commandLine?.flashSuccess(chalk.white.bold(`Dev console is ready to go! 🚀`))
        })
        .catch(() => {})
    })
  }

  async reload(log: Log, garden: Garden) {
    this.commandLine?.disable("🌸  Loading Garden project...")

    try {
      const newGarden = await Garden.factory(garden.projectRoot, garden.opts)
      const configDump = await newGarden.dumpConfig({ log })
      const commands = await this.getCommands(newGarden)

      // TODO: restart monitors

      this.garden = newGarden
      await this.commandLine?.update(newGarden, configDump, commands)
      await this.server?.setGarden(newGarden)
      this.autocompleter = new Autocompleter({ log, commands, configDump })

      this.commandLine?.flashSuccess(`Project successfully loaded!`)
    } catch (error) {
      log.error(`Failed loading the project: ${error}`)
      this.commandLine?.flashError(
        `Failed loading the project. See above logs for details. Type ${chalk.white("reload")} to try again.`
      )
    } finally {
      this.commandLine?.enable()
    }
  }

  async getCommands(garden: Garden) {
    const builtinCommands = getBuiltinCommands()
    const customCommands = await getCustomCommands(garden.log, garden.projectRoot)

    return [
      ...builtinCommands,
      ...customCommands,
      ...flattenCommands([
        new AutocompleteCommand(this),
        new ReloadCommand(this),
        new LogLevelCommand(),
        new HideCommand(),
      ]),
    ]
  }

  getAutocompleteSuggestions(input: string): AutocompleteSuggestion[] {
    if (!this.autocompleter) {
      return []
    }

    // TODO: make the opts configurable
    return this.autocompleter.getSuggestions(input, { limit: 100, ignoreGlobalFlags: true })
  }
}

const autocompleteArguments = {
  input: new StringParameter({
    help: "The input string to provide suggestions for.",
    required: true,
  }),
}

type AutocompleteArguments = typeof autocompleteArguments

interface AutocompleteResult {
  input: string
  suggestions: AutocompleteSuggestion[]
}

class AutocompleteCommand extends ConsoleCommand<AutocompleteArguments> {
  name = "autocomplete"
  help = "Given an input string, provide a list of suggestions for available Garden commands."
  hidden = true

  arguments = autocompleteArguments

  constructor(private serverCommand: ServeCommand) {
    super()
  }

  async action({ args }: CommandParams<AutocompleteArguments>): Promise<CommandResult<AutocompleteResult>> {
    const { input } = args

    return {
      result: {
        input,
        suggestions: this.serverCommand.getAutocompleteSuggestions(input),
      },
    }
  }
}

class ReloadCommand extends ConsoleCommand {
  name = "reload"
  help = "Reload the project and action/module configuration."

  constructor(private serverCommand: ServeCommand) {
    super()
  }

  async action({ garden, log }: CommandParams) {
    await this.serverCommand.reload(log, garden)
    return {}
  }
}

const logLevelArguments = {
  level: new ChoicesParameter({
    choices: getLogLevelChoices(),
    help: "The log level to set",
    required: true,
  }),
}

type LogLevelArguments = typeof logLevelArguments

// These are the only writers for which we want to dynamically update the log level
const displayWriterTypes = ["basic", "ink"]

class LogLevelCommand extends ConsoleCommand<LogLevelArguments> {
  name = "log-level"
  help = "Change the max log level of (future) printed logs in the console."

  arguments = logLevelArguments

  async action({ log, commandLine, args }: CommandParams<LogLevelArguments>) {
    const level = args.level

    const logger = log.root

    const writers = logger.getWriters()
    for (const writer of [writers.display, ...writers.file]) {
      if (displayWriterTypes.includes(writer.type)) {
        writer.level = level as unknown as LogLevel
      }
    }

    commandLine?.flashMessage(`Log level set to ${level}`)

    return {}
  }
}

const hideArgs = {
  type: new ChoicesParameter({
    help: "The type of monitor to stop. Skip to stop all monitoring.",
    choices: ["log", "logs", "sync", "syncs", "local", ""],
    defaultValue: "",
  }),
  names: new StringsParameter({
    help: "The name(s) of the deploy(s) to stop monitoring for (skip to stop monitoring all of them). You may specify multiple names, separated by spaces.",
    spread: true,
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.actionConfigs.Deploy)
    },
  }),
}

type HideArgs = typeof hideArgs

class HideCommand extends ConsoleCommand<HideArgs> {
  name = "hide"
  help = "Stop monitoring for logs for all or specified Deploy actions"

  arguments = hideArgs

  async action({ garden, log, args }: CommandParams<HideArgs>) {
    let type = args.type
    const names = !args.names || args.names.length === 0 ? ["*"] : args.names

    // Support plurals as aliases
    if (type === "logs" || type === "syncs") {
      type = type.slice(0, -1)
    }

    log.info("")

    if (!type) {
      log.info("Stopping all monitors...")
    } else if (names.includes("*")) {
      log.info(`Stopping all ${type} monitors...`)
    } else {
      log.info(`Stopping ${type} monitors for Deploy(s) matching ` + naturalList(names, { quote: true }))
    }

    const monitors = garden.monitors.getActive()

    for (const monitor of monitors) {
      if (monitor && (!type || monitor.type === type) && isMatch(monitor.key(), names)) {
        log.info(`Stopping ${monitor.description()}...`)
        garden.monitors.stop(monitor, log)
      }
    }

    log.info("Done!\n")

    return {}
  }
}
