/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Joi = require("@hapi/joi")
import stripAnsi from "strip-ansi"
import { GardenError, RuntimeError, InternalError, ParameterError } from "../exceptions"
import { TaskResults } from "../task-graph"
import { LoggerType } from "../logger/logger"
import { ProcessResults } from "../process"
import { Garden } from "../garden"
import { LogEntry } from "../logger/log-entry"
import { printFooter } from "../logger/util"
import { GlobalOptions } from "../cli/cli"
import { joi } from "../config/common"
import inquirer = require("inquirer")
import dedent = require("dedent")
import chalk from "chalk"

export interface ParameterConstructor<T> {
  help: string
  required?: boolean
  alias?: string
  defaultValue?: T
  valueName?: string
  hints?: string
  overrides?: string[]
  cliDefault?: T
  cliOnly?: boolean
}

export abstract class Parameter<T> {
  abstract type: string

  // TODO: use this for validation in the CLI (currently just used in the service API)
  abstract schema: Joi.Schema

  _valueType: T

  defaultValue: T | undefined
  help: string
  required: boolean
  alias?: string
  hints?: string
  valueName: string
  overrides: string[]

  readonly cliDefault: T | undefined // Optionally specify a separate default for CLI invocation
  readonly cliOnly: boolean // If true, only expose in the CLI, and not in the HTTP/WS server.

  constructor({
    help,
    required,
    alias,
    defaultValue,
    valueName,
    overrides,
    hints,
    cliDefault,
    cliOnly,
  }: ParameterConstructor<T>) {
    this.help = help
    this.required = required || false
    this.alias = alias
    this.hints = hints
    this.defaultValue = defaultValue
    this.valueName = valueName || "_valueType"
    this.overrides = overrides || []
    this.cliDefault = cliDefault
    this.cliOnly = cliOnly || false
  }

  coerce(input: T): T | undefined {
    return input
  }

  abstract parseString(input: string): T

  async autoComplete(): Promise<string[]> {
    return []
  }
}

export class StringParameter extends Parameter<string> {
  type = "string"
  schema = joi.string()

  parseString(input: string) {
    return input
  }
}

// Separating this from StringParameter for now because we can't set the output type based on the required flag
// FIXME: Maybe use a Required<Parameter> type to enforce presence, rather that an option flag?
export class StringOption extends Parameter<string | undefined> {
  type = "string"
  schema = joi.string()

  parseString(input?: string) {
    return input
  }
}

export interface StringsConstructor extends ParameterConstructor<string[]> {
  delimiter?: string
}

export class StringsParameter extends Parameter<string[] | undefined> {
  type = "array:string"
  schema = joi.array().items(joi.string())
  delimiter: string

  constructor(args: StringsConstructor) {
    super(args)

    this.delimiter = args.delimiter || ","
  }

  // Sywac returns [undefined] if input is empty so we coerce that into undefined.
  // This only applies to optional parameters since Sywac would throw if input is empty for a required parameter.
  coerce(input: string[]) {
    const filtered = input.filter((i) => !!i)
    if (filtered.length < 1) {
      return undefined
    }
    return filtered
  }

  parseString(input: string) {
    return input.split(this.delimiter)
  }
}

export class PathParameter extends Parameter<string> {
  type = "path"
  schema = joi.posixPath()

  parseString(input: string) {
    return input
  }
}

export class PathsParameter extends Parameter<string[]> {
  type = "array:path"
  schema = joi.array().items(joi.posixPath())

  parseString(input: string) {
    return input.split(",")
  }
}

export class IntegerParameter extends Parameter<number> {
  type = "number"
  schema = joi.number().integer()

  parseString(input: string) {
    try {
      return parseInt(input, 10)
    } catch {
      throw new ParameterError(`Could not parse "${input}" as integer`, {
        expectedType: "integer",
        input,
      })
    }
  }
}

export interface ChoicesConstructor extends ParameterConstructor<string> {
  choices: string[]
}

export class ChoicesParameter extends Parameter<string> {
  type = "choice"
  choices: string[]
  schema = joi.string()

  constructor(args: ChoicesConstructor) {
    super(args)

    this.choices = args.choices
    this.schema = joi.string().valid(...args.choices)
  }

  parseString(input: string) {
    if (this.choices.includes(input)) {
      return input
    } else {
      throw new ParameterError(`"${input}" is not a valid argument`, {
        expectedType: `One of: ${this.choices.join(", ")}`,
        input,
      })
    }
  }

  async autoComplete() {
    return this.choices
  }
}

export class BooleanParameter extends Parameter<boolean> {
  type = "boolean"
  schema = joi.boolean()

  parseString(input: any) {
    return !!input
  }
}

// TODO: maybe this should be a global option?
export class EnvironmentOption extends StringParameter {
  constructor({ help = "The environment (and optionally namespace) to work against." } = {}) {
    super({
      help,
      required: false,
      alias: "e",
    })
  }
}

export type Parameters = { [key: string]: Parameter<any> }
export type ParameterValues<T extends Parameters> = {
  [P in keyof T]: T[P]["_valueType"]
}

export interface CommandConstructor {
  new (parent?: Command): Command
}

export interface CommandResult<T = any> {
  result?: T
  restartRequired?: boolean
  errors?: GardenError[]
}

export interface CommandParamsBase<T extends Parameters = {}, U extends Parameters = {}> {
  args: ParameterValues<T> & { _?: string[] }
  opts: ParameterValues<GlobalOptions & U>
  log: LogEntry
}

export interface PrepareParams<T extends Parameters = {}, U extends Parameters = {}> extends CommandParamsBase<T, U> {
  headerLog: LogEntry
  footerLog: LogEntry
}

export interface CommandParams<T extends Parameters = {}, U extends Parameters = {}> extends PrepareParams<T, U> {
  garden: Garden
}

interface PrepareOutput {
  // Commands should set this to true if the command is long-running
  persistent: boolean
}

export abstract class Command<T extends Parameters = {}, U extends Parameters = {}> {
  abstract name: string
  abstract help: string

  description?: string
  alias?: string
  loggerType?: LoggerType

  arguments?: T
  options?: U

  cliOnly: boolean = false
  noProject: boolean = false
  hidden: boolean = false

  protected: boolean = false

  subCommands: CommandConstructor[] = []

  constructor(private parent?: Command) {
    // Make sure arguments and options don't have overlapping key names.
    if (this.arguments && this.options) {
      for (const key of Object.keys(this.options)) {
        if (key in this.arguments) {
          const commandName = this.getFullName()

          throw new InternalError(`Key ${key} is defined in both options and arguments for command ${commandName}`, {
            commandName,
            key,
          })
        }
      }
    }
  }

  getKey() {
    return !!this.parent ? `${this.parent.getKey()}.${this.name}` : this.name
  }

  getFullName() {
    return !!this.parent ? `${this.parent.getFullName()} ${this.name}` : this.name
  }

  getSubCommands(): Command[] {
    return this.subCommands.map((cls) => new cls(this))
  }

  describe() {
    const { name, help, description, cliOnly } = this
    const subCommands = this.subCommands.map((S) => new S(this).describe())

    return {
      name,
      fullName: this.getFullName(),
      help,
      description: description ? stripAnsi(description) : undefined,
      cliOnly,
      subCommands,
      arguments: describeParameters(this.arguments),
      options: describeParameters(this.options),
    }
  }

  /**
   * Called by the CLI before the command's action is run, but is not called again
   * if the command restarts. Useful for commands in watch mode.
   */
  async prepare(_: PrepareParams<T, U>): Promise<PrepareOutput> {
    return { persistent: false }
  }

  // Note: Due to a current TS limitation (apparently covered by https://github.com/Microsoft/TypeScript/issues/7011),
  // subclass implementations need to explicitly set the types in the implemented function signature. So for now we
  // can't enforce the types of `args` and `opts` automatically at the abstract class level and have to specify
  // the types explicitly on the subclassed methods.
  abstract async action(params: CommandParams<T, U>): Promise<CommandResult>

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
  async isAllowedToRun(garden: Garden, log: LogEntry, opts: GlobalOptions): Promise<Boolean> {
    log.root.stop()
    if (!opts.yes && this.protected && garden.production) {
      const defaultMessage = chalk.yellow(dedent`
        Warning: you are trying to run "garden ${this.getFullName()}" against a production environment ([${
        garden.environmentName
      }])!
          Are you sure you want to continue? (run the command with the "--yes" flag to skip this check).

      `)
      const answer: any = await inquirer.prompt({
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
}

export async function handleTaskResults(
  log: LogEntry,
  taskType: string,
  results: ProcessResults
): Promise<CommandResult<TaskResults>> {
  const failed = Object.values(results.taskResults).filter((r) => r && r.error).length

  if (failed) {
    const error = new RuntimeError(`${failed} ${taskType} task(s) failed!`, {
      results,
    })
    return { errors: [error] }
  }

  if (!results.restartRequired) {
    printFooter(log)
  }
  return {
    result: results.taskResults,
    restartRequired: results.restartRequired,
  }
}

export function describeParameters(args?: Parameters) {
  if (!args) {
    return
  }
  return Object.entries(args).map(([argName, arg]) => ({
    name: argName,
    usageName: arg.required ? `<${argName}>` : `[${argName}]`,
    ...arg,
    help: stripAnsi(arg.help),
  }))
}
