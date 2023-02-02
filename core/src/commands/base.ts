/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Joi = require("@hapi/joi")
import chalk from "chalk"
import dedent = require("dedent")
import stripAnsi from "strip-ansi"
import { pickBy, size } from "lodash"

import { joi } from "../config/common"
import { InternalError, RuntimeError, GardenBaseError } from "../exceptions"
import { Garden } from "../garden"
import { LogEntry } from "../logger/log-entry"
import { LoggerType } from "../logger/logger"
import { printFooter, renderMessageWithDivider } from "../logger/util"
import { ProcessResults } from "../process"
import { GraphResultMap } from "../graph/results"
import { capitalize } from "lodash"
import { userPrompt } from "../util/util"
import { renderOptions, renderCommands, renderArguments, getCliStyles } from "../cli/helpers"
import { GlobalOptions, ParameterValues, Parameters } from "../cli/params"
import { GardenServer } from "../server/server"
import { GardenCli } from "../cli/cli"

export interface CommandConstructor {
  new (parent?: CommandGroup): Command
}

export interface CommandResult<T = any> {
  result?: T
  restartRequired?: boolean
  errors?: GardenBaseError[]
  exitCode?: number
}

export interface BuiltinArgs {
  // The raw unprocessed arguments
  "$all"?: string[]
  // Everything following -- on the command line
  "--"?: string[]
}

export interface CommandParamsBase<T extends Parameters = {}, U extends Parameters = {}> {
  args: ParameterValues<T> & BuiltinArgs
  opts: ParameterValues<GlobalOptions & U>
}

export interface PrintHeaderParams<T extends Parameters = {}, U extends Parameters = {}>
  extends CommandParamsBase<T, U> {
  headerLog: LogEntry
}

export interface PrepareParams<T extends Parameters = {}, U extends Parameters = {}> extends CommandParamsBase<T, U> {
  headerLog: LogEntry
  footerLog: LogEntry
  log: LogEntry
}

export interface CommandParams<T extends Parameters = {}, U extends Parameters = {}> extends PrepareParams<T, U> {
  cli?: GardenCli
  garden: Garden
}

type DataCallback = (data: string) => void

export abstract class Command<T extends Parameters = {}, U extends Parameters = {}, R = any> {
  abstract name: string
  abstract help: string

  description?: string
  aliases?: string[]

  allowUndefinedArguments: boolean = false
  arguments: T
  options: U
  _resultType: R

  outputsSchema?: () => Joi.ObjectSchema

  cliOnly: boolean = false
  hidden: boolean = false
  noProject: boolean = false
  protected: boolean = false
  streamEvents: boolean = false // Set to true to stream events for the command
  streamLogEntries: boolean = false // Set to true to stream log entries for the command
  server: GardenServer | undefined = undefined

  subscribers: DataCallback[]
  terminated: boolean

  constructor(private parent?: CommandGroup) {
    this.subscribers = []
    this.terminated = false

    const commandName = this.getFullName()

    // Make sure arguments and options don't have overlapping key names.
    if (this.arguments && this.options) {
      for (const key of Object.keys(this.options)) {
        if (key in this.arguments) {
          throw new InternalError(`Key ${key} is defined in both options and arguments for command ${commandName}`, {
            commandName,
            key,
          })
        }
      }
    }

    const args = Object.values(this.arguments || [])
    let foundOptional = false

    for (let i = 0; i < args.length; i++) {
      const arg = args[i]

      // Make sure arguments don't have default values
      if (arg.defaultValue) {
        throw new InternalError(`A positional argument cannot have a default value`, {
          commandName,
          arg,
        })
      }

      if (arg.required) {
        // Make sure required arguments don't follow optional ones
        if (foundOptional) {
          throw new InternalError(`A required argument cannot follow an optional one`, {
            commandName,
            arg,
          })
        }
      } else {
        foundOptional = true
      }

      // Make sure only last argument is spread
      if (arg.spread && i < args.length - 1) {
        throw new InternalError(`Only the last command argument can set spread to true`, {
          commandName,
          arg,
        })
      }
    }
  }

  getKey() {
    return !!this.parent ? `${this.parent.getKey()}.${this.name}` : this.name
  }

  getFullName(): string {
    return !!this.parent ? `${this.parent.getFullName()} ${this.name}` : this.name
  }

  getPath(): string[] {
    return !!this.parent ? [...this.parent.getPath(), this.name] : [this.name]
  }

  /**
   * Returns all paths that this command should match, including all aliases and permutations of those.
   */
  getPaths(): string[][] {
    if (this.parent) {
      const parentPaths = this.parent.getPaths()

      if (this.aliases) {
        return parentPaths.flatMap((parentPath) => [
          [...parentPath, this.name],
          ...this.aliases!.map((a) => [...parentPath, a]),
        ])
      } else {
        return parentPaths.map((parentPath) => [...parentPath, this.name])
      }
    } else if (this.aliases) {
      return [[this.name], ...this.aliases.map((a) => [a])]
    } else {
      return [[this.name]]
    }
  }

  getLoggerType(_: CommandParamsBase<T, U>): LoggerType {
    return "fancy"
  }

  describe() {
    const { name, help, description, cliOnly } = this

    return {
      name,
      fullName: this.getFullName(),
      help,
      description: description ? stripAnsi(description) : undefined,
      cliOnly,
      arguments: describeParameters(this.arguments),
      options: describeParameters(this.options),
      outputsSchema: this.outputsSchema,
    }
  }

  /**
   * Called to check if the command would run persistently, with the given args/opts
   */
  isPersistent(_: PrepareParams<T, U>) {
    return false
  }

  /**
   * Called by the CLI before the command's action is run, but is not called again
   * if the command restarts. Useful for commands in watch mode.
   */
  async prepare(_: PrepareParams<T, U>): Promise<void> {}

  /**
   * Called by e.g. the WebSocket server to terminate persistent commands.
   */
  terminate() {
    this.terminated = true
  }

  /**
   * Subscribe to any data emitted by commands via the .emit() method
   */
  subscribe(cb: (data: string) => void) {
    this.subscribers.push(cb)
  }

  /**
   * Emit data to all subscribers
   */
  emit(log: LogEntry, data: string) {
    for (const subscriber of this.subscribers) {
      // Ignore any errors here
      try {
        subscriber(data)
      } catch (err) {
        log.debug(`Error when calling subscriber on ${this.getFullName()} command: ${err.message}`)
      }
    }
  }

  abstract printHeader(params: PrintHeaderParams<T, U>): void

  // Note: Due to a current TS limitation (apparently covered by https://github.com/Microsoft/TypeScript/issues/7011),
  // subclass implementations need to explicitly set the types in the implemented function signature. So for now we
  // can't enforce the types of `args` and `opts` automatically at the abstract class level and have to specify
  // the types explicitly on the subclassed methods.
  abstract action(params: CommandParams<T, U>): Promise<CommandResult<R>>

  /**
   * Called on all commands and checks if the command is protected.
   * If it's a protected command, the environment is "production" and the user hasn't specified the "--yes/-y" option
   * it asks for confirmation to proceed.
   *
   * @param {Garden} garden
   * @param {LogEntry} log
   * @param {GlobalOptions} opts
   * @returns {Promise<Boolean>}
   * @memberof Command
   */
  async isAllowedToRun(garden: Garden, log: LogEntry, opts: ParameterValues<GlobalOptions>): Promise<Boolean> {
    log.root.stop()
    if (!opts.yes && this.protected && garden.production) {
      const defaultMessage = chalk.yellow(dedent`
        Warning: you are trying to run "garden ${this.getFullName()}" against a production environment ([${
        garden.environmentName
      }])!
          Are you sure you want to continue? (run the command with the "--yes" flag to skip this check).

      `)
      const answer = await userPrompt({
        name: "continue",
        message: defaultMessage,
        type: "confirm",
        default: false,
      })

      log.info("")

      return answer.continue
    }

    return true
  }

  renderHelp() {
    const cliStyles = getCliStyles()

    let out = this.description ? `${cliStyles.heading("DESCRIPTION")}\n\n${chalk.dim(this.description.trim())}\n\n` : ""

    out += `${cliStyles.heading("USAGE")}\n  garden ${this.getFullName()} `

    if (this.arguments) {
      out +=
        Object.entries(this.arguments)
          .map(([name, param]) => cliStyles.usagePositional(name, param.required))
          .join(" ") + " "
    }

    out += cliStyles.optionsPlaceholder()

    if (this.arguments) {
      const table = renderArguments(this.arguments)
      out += `\n\n${cliStyles.heading("ARGUMENTS")}\n${table}`
    }

    if (this.options) {
      const table = renderOptions(this.options)
      out += `\n\n${cliStyles.heading("OPTIONS")}\n${table}`
    }

    return out + "\n"
  }
}

export abstract class CommandGroup extends Command {
  abstract subCommands: CommandConstructor[]

  getSubCommands(): Command[] {
    return this.subCommands.flatMap((cls) => {
      const cmd = new cls(this)
      if (cmd instanceof CommandGroup) {
        return cmd.getSubCommands()
      } else {
        return [cmd]
      }
    })
  }

  printHeader() {}

  async action() {
    return {}
  }

  describe() {
    const description = super.describe()
    const subCommands = this.subCommands.map((S) => new S(this).describe())

    return {
      ...description,
      subCommands,
    }
  }

  renderHelp() {
    const cliStyles = getCliStyles()
    const commands = this.subCommands.map((c) => new c(this))

    return `
${cliStyles.heading("USAGE")}
  garden ${this.getFullName()} ${cliStyles.commandPlaceholder()} ${cliStyles.optionsPlaceholder()}

${cliStyles.heading("COMMANDS")}
${renderCommands(commands)}
`
  }
}

export function printResult({
  log,
  result,
  success,
  description,
}: {
  log: LogEntry
  result: string
  success: boolean
  description: string
}) {
  const prefix = success ? `${capitalize(description)} output:` : `${capitalize(description)} failed with error:`
  const msg = renderMessageWithDivider(prefix, result, !success)
  success ? log.info(chalk.white(msg)) : log.error(msg)
}

// TODO-G2: update
export interface ProcessCommandResult {
  aborted: boolean
  // durationMsec?: number | null
  success: boolean
  error?: string
  graphResults: GraphResultMap
}

export const processCommandResultKeys = () => ({
  aborted: joi
    .boolean()
    .description(
      "Set to true if the action was not attempted, e.g. if a dependency failed or parameters were incorrect."
    ),
  // durationMsec: joi.number().integer().description("The duration of the processing in msec, if applicable."),
  success: joi.boolean().required().description("Whether the action was succeessful."),
  error: joi.string().description("An error message, if the action failed."),
})

export const graphResultsSchema = () =>
  joi
    .object()
    .description(
      "A map of all raw graph results. Avoid using this programmatically if you can, and use more structured keys instead."
    )
    .meta({ keyPlaceholder: "<key>" })

// TODO-G2: update
export const processCommandResultSchema = () =>
  joi.object().keys({
    aborted: joi.boolean().description("Set to true if the command execution was aborted."),
    success: joi.boolean().description("Set to false if the command execution was unsuccessful."),
    graphResults: graphResultsSchema(),
  })

/**
 * Handles the command result and logging for commands the return results of type ProcessResults.
 * This applies to commands that can run in watch mode.
 */
export async function handleProcessResults(
  log: LogEntry,
  taskType: string,
  results: ProcessResults
): Promise<CommandResult<ProcessCommandResult>> {
  const graphResults = results.graphResults.getMap()

  const failed = pickBy(graphResults, (r) => r && r.error)
  const failedCount = size(failed)

  const success = failedCount === 0

  const result: ProcessCommandResult = {
    aborted: false,
    success,
    graphResults,
  }

  if (!success) {
    const error = new RuntimeError(`${failedCount} ${taskType} action(s) failed!`, { results: failed })
    return { result, errors: [error], restartRequired: false }
  }

  if (!results.restartRequired) {
    printFooter(log)
  }
  return {
    result,
    restartRequired: results.restartRequired,
  }
}

export function describeParameters(args?: Parameters) {
  if (!args) {
    return
  }
  return Object.entries(args)
    .filter(([_, arg]) => !arg.hidden)
    .map(([argName, arg]) => ({
      name: argName,
      usageName: arg.required ? `<${argName}>` : `[${argName}]`,
      ...arg,
      help: stripAnsi(arg.help),
    }))
}
