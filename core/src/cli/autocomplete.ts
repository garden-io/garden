/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Memoize } from "typescript-memoize"
import { Command, CommandGroup } from "../commands/base"
import { ConfigDump } from "../garden"
import { Log } from "../logger/log-entry"
import { parseCliArgs, pickCommand } from "./helpers"
import { globalOptions, Parameter, Parameters } from "./params"

export interface AutocompleteSuggestion {
  // What's being suggested in the last item in the split array
  type: "command" | "argument" | "option"
  line: string
  command: {
    name: string[]
    cliOnly: boolean
  }
  stringArguments?: string[]
  priority: number
}

// TODO: there are plenty of optimizations that can be made here
// TODO: validate the input string (to e.g. highlight invalid names/arguments/flags in red)

interface AutocompleterParams {
  log: Log
  commands: Command[]
  configDump?: ConfigDump
  debug?: boolean
}

interface GetSuggestionsOpts {
  limit?: number
  ignoreGlobalFlags?: boolean
}

export class Autocompleter {
  private log: Log
  private commands: (Command | CommandGroup)[]
  private configDump?: ConfigDump
  private enableDebug: boolean

  constructor({ log, commands, configDump, debug }: AutocompleterParams) {
    this.log = log
    this.configDump = configDump
    this.commands = commands
    this.enableDebug = !!debug
  }

  getSuggestions(input: string, { limit, ignoreGlobalFlags }: GetSuggestionsOpts = {}) {
    const output: AutocompleteSuggestion[] = []

    if (input.trim().length === 0) {
      this.debug("empty string -> no results")
      return output
    }

    let { command, rest, matchedPath = [] } = this.findCommand(input.split(" "))

    this.debug({ input, command: command?.getFullName(), rest })

    if (command) {
      // Suggest subcommand names if command group was matched
      if (command instanceof CommandGroup) {
        const commands = command.getSubCommands()
        output.push(...this.matchCommandNames(commands, input))
      } else {
        // Include the command itself if matching exact string
        if (rest.length === 0) {
          output.push(...this.matchCommandNames([command], input))
        }

        output.push(
          ...this.getCommandArgSuggestions({
            command,
            input,
            rest,
            configDump: this.configDump,
            matchedPath,
            ignoreGlobalFlags,
          })
        )
      }
    }

    // Suggest command names if no command was matched
    if (!command && input[0] && input[0] !== " ") {
      output.push(...this.matchCommandNames(this.commands, input))
    }

    // This basically sorts first by priority, then length of suggestion, then alphabetically, descending order
    const sorted = output.sort(
      (a, b) => b.priority - a.priority || a.line.length - b.line.length || a.line.localeCompare(b.line)
    )

    this.debug(sorted)

    return limit ? sorted.slice(0, limit) : sorted
  }

  @Memoize((rawArgs) => rawArgs.join(" "))
  private findCommand(rawArgs: string[]) {
    return pickCommand(this.commands, rawArgs)
  }

  private debug(msg: any) {
    this.enableDebug &&
      this.log.silly({ section: "autocompleter", msg: typeof msg === "string" ? msg : JSON.stringify(msg) })
  }

  private matchCommandNames(commands: Command[], input: string) {
    interface CommandMatch {
      matchedString: string
      matchedPath: string[]
      command: Command
    }

    const matches: { [key: string]: CommandMatch } = {}

    const output: AutocompleteSuggestion[] = []

    for (const command of commands) {
      // TODO: should we maybe skip deprecated aliases?
      for (const path of command.getPaths()) {
        const fullName = path.join(" ")
        if (fullName.startsWith(input)) {
          const key = command.getFullName()
          const existing = matches[key]

          if (
            !existing ||
            // Prefer match on canonical command name
            key === fullName ||
            // followed by shorter match
            (existing.matchedString !== key && existing.matchedString.length > fullName.length)
          ) {
            matches[key] = {
              matchedString: fullName,
              matchedPath: path,
              command,
            }
          }
        }
      }
    }

    for (const match of Object.values(matches)) {
      output.push({
        type: "command",
        line: match.matchedString,
        command: {
          name: match.matchedPath,
          cliOnly: match.command.cliOnly,
        },
        priority: 1,
      })
    }

    this.debug(`Matched commands to input '${input}': ${output.map((s) => s.command.name.join(" "))}`)

    return output
  }

  private getCommandArgSuggestions(params: GetCommandArgParams) {
    const { rest } = params
    const lastArg = rest[rest.length - 1]
    const lastCompleteArg = rest[rest.length - 2]
    const stopArgIndex = rest.indexOf("--")

    if (stopArgIndex > -1 && rest.length - 1 > stopArgIndex) {
      // Don't suggest anything after " -- "
      this.debug(`Not suggesting anything after ' -- '`)
      return []
    }

    if (lastArg === "-" || lastArg === "--") {
      // Suggest any of the option flags available
      return this.getOptionFlagSuggestions(params)
    }

    if (lastArg?.startsWith("-")) {
      // 'tis most likely an option flag
      return this.getOptionFlagSuggestions(params)
    }

    if (lastCompleteArg?.startsWith("-")) {
      // This may be a value on an option flag
      // TODO
      return []
    }

    if (lastCompleteArg?.startsWith("-")) {
      // TODO
      // This may be a value on an option flag
    }
    return [...this.getArgumentSuggestions(params), ...this.getOptionFlagSuggestions(params)]
  }

  private getArgumentSuggestions(params: GetCommandArgParams) {
    const { command, input, rest, configDump, matchedPath } = params

    if (!configDump) {
      return []
    }

    const stringArgs = input[input.length - 1] === " " ? rest.slice(0, -1) : rest
    const parsed = parseCliArgs({ stringArgs, command, cli: true })
    const argIndex = parsed._.length
    const argSpecs = <Parameter<any>[]>Object.values(command.arguments || {})

    let argSpec = argSpecs[argIndex]

    if (!argSpec) {
      // No more positional args
      const lastSpec = argSpecs[argSpecs.length - 1]

      if (lastSpec?.spread) {
        // There is a spread argument
        argSpec = lastSpec
      } else {
        return []
      }
    }

    const prefix = rest.length === 0 ? "" : rest[rest.length - 1]
    const argSuggestions = argSpec.getSuggestions({ configDump })

    return argSuggestions
      .filter((s) => prefix === s || (s.startsWith(prefix) && !rest.includes(s)))
      .map((s) => {
        const split = [...matchedPath, ...rest]

        if (rest.length === 0) {
          split.push(s)
        } else {
          split[split.length - 1] = s
        }

        // Separate the string arguments from the command
        const stringArguments = split.filter((arg) => arg !== command.getPath().join(" "))

        return <AutocompleteSuggestion>{
          type: "argument",
          line: split.join(" "),
          command: {
            name: command.getPath(),
            cliOnly: command.cliOnly,
          },
          stringArguments,
          priority: 1000, // Rank these above option flags
        }
      })
  }

  private getOptionFlagSuggestions(params: GetCommandArgParams) {
    const { command, rest, matchedPath, ignoreGlobalFlags } = params

    const lastArg = rest[rest.length - 1]

    if (lastArg && !lastArg.startsWith("-")) {
      return []
    }

    const opts: Parameters = {
      ...(ignoreGlobalFlags ? {} : globalOptions),
      ...command.options,
    }

    let keys = Object.keys(opts)

    // Filter on partial option flag entered
    if (lastArg && lastArg.startsWith("--") && lastArg.length > 2) {
      keys = keys.filter((k) => k.startsWith(lastArg.slice(2)))
    }

    return keys.map((k) => {
      const split = [...matchedPath, ...rest]
      const s = "--" + k

      if (rest.length === 0) {
        split.push(s)
      } else {
        split[split.length - 1] = s
      }

      return <AutocompleteSuggestion>{
        type: "option",
        line: split.join(" "),
        command: {
          name: command.getPath(),
          cliOnly: command.cliOnly,
        },
        // prefer command-specific flags
        priority: globalOptions[k] ? 1 : 2,
      }
    })
  }
}

interface GetCommandArgParams {
  command: Command
  input: string
  rest: string[]
  matchedPath: string[]
  ignoreGlobalFlags?: boolean
  configDump?: ConfigDump
}
