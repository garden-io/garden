/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { InteractiveCommand, PrepareParams } from "./base"
import { Command, CommandResult, CommandParams } from "./base"
import { GardenServer, startServer } from "../server/server"
import { Parameters, IntegerParameter, ChoicesParameter, StringParameter } from "../cli/params"
import { printHeader } from "../logger/util"
import { Garden } from "../garden"
import { dedent } from "../util/string"
import { getLogLevelChoices, LogLevel } from "../logger/logger"
import { getBuiltinCommands } from "./commands"
import { getCustomCommands } from "./custom"
import { Log } from "../logger/log-entry"
import { CommandLine } from "../cli/command-line"
import { Autocompleter, AutocompleteSuggestion } from "../cli/autocomplete"
import chalk from "chalk"

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
    printHeader(headerLog, "Server", "bar_chart")
  }

  terminate() {
    super.terminate()
    this.garden?.events.emit("_exit", {})
    this.server?.close().catch(() => {})
  }

  isPersistent() {
    return true
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
    const customCommands = await getCustomCommands(garden.projectRoot)

    return [
      ...builtinCommands,
      ...customCommands,
      new AutocompleteCommand(this),
      new ReloadCommand(this),
      new LogLevelCommand(),
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

class AutocompleteCommand extends InteractiveCommand<AutocompleteArguments> {
  name = "autocomplete"
  help = "Given an input string, provide a list of suggestions for available Garden commands."
  hidden = true

  arguments = autocompleteArguments

  constructor(private serverCommand: ServeCommand) {
    super()
  }

  async action({ args }: CommandParams<AutocompleteArguments>): Promise<CommandResult<AutocompleteSuggestion[]>> {
    return {
      result: this.serverCommand.getAutocompleteSuggestions(args.input),
    }
  }
}

class ReloadCommand extends InteractiveCommand {
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

class LogLevelCommand extends InteractiveCommand<LogLevelArguments> {
  name = "log-level"
  help = "Change the max log level of (future) printed logs in the console."

  arguments = logLevelArguments

  async action({ log, commandLine, args }: CommandParams<LogLevelArguments>) {
    const level = args.level

    const logger = log.root

    for (const writer of logger.getWriters()) {
      if (displayWriterTypes.includes(writer.type)) {
        writer.level = (level as unknown) as LogLevel
      }
    }

    commandLine?.flashMessage(`Log level set to ${level}`)

    return {}
  }
}
