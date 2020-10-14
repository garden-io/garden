/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Joi = require("@hapi/joi")
import stripAnsi from "strip-ansi"
import stringify from "json-stringify-safe"

import { joi, DeepPrimitiveMap } from "../config/common"
import { ParameterError } from "../exceptions"
import { parseEnvironment } from "../config/project"
import { LOGGER_TYPES, getLogLevelChoices, envSupportsEmoji } from "../logger/logger"
import { deline } from "../util/string"
import chalk = require("chalk")
import { LogLevel } from "../logger/log-node"
import { safeDumpYaml } from "../util/util"
import { resolve } from "path"

export const OUTPUT_RENDERERS = {
  json: (data: DeepPrimitiveMap) => {
    return stringify(data, null, 2)
  },
  yaml: (data: DeepPrimitiveMap) => {
    // Convert data to JSON object so that `safeDumpYaml` renders any errors.
    return safeDumpYaml(JSON.parse(JSON.stringify(data)), { noRefs: true })
  },
}

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
  hidden?: boolean
}

export abstract class Parameter<T> {
  abstract type: string
  abstract schema: Joi.Schema

  _valueType: T

  defaultValue: T | undefined
  help: string
  required: boolean
  alias?: string
  hints?: string
  valueName: string
  overrides: string[]
  hidden: boolean

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
    hidden,
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
    this.hidden = hidden || false
  }

  // TODO: merge this and the parseString method?
  validate(input: T): T | undefined {
    // TODO: make sure the error message thrown is nice and readable
    this.schema.validate(input)
    return input
  }

  coerce(input?: string): T {
    return (input as unknown) as T
  }

  getDefaultValue(cli: boolean) {
    return cli && this.cliDefault !== undefined ? this.cliDefault : this.defaultValue
  }

  async autoComplete(): Promise<string[]> {
    return []
  }
}

export class StringParameter extends Parameter<string> {
  type = "string"
  schema = joi.string()
}

// Separating this from StringParameter for now because we can't set the output type based on the required flag
// FIXME: Maybe use a Required<Parameter> type to enforce presence, rather that an option flag?
export class StringOption extends Parameter<string | undefined> {
  type = "string"
  schema = joi.string()
}

export interface StringsConstructor extends ParameterConstructor<string[]> {
  delimiter?: string
  variadic?: boolean
}

export class StringsParameter extends Parameter<string[] | undefined> {
  type = "array:string"
  schema = joi.array().items(joi.string())

  delimiter: string | RegExp
  variadic: boolean

  constructor(args: StringsConstructor) {
    super(args)

    // The default delimiter splits on commas, ignoring commas between double quotes
    this.delimiter = args.delimiter || /,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/
    this.variadic = !!args.variadic
  }

  coerce(input?: string): string[] {
    return input?.split(this.delimiter) || []
  }
}

export class PathParameter extends Parameter<string> {
  type = "path"
  schema = joi.string()

  coerce(input?: string): string {
    return resolve(process.cwd(), input || ".")
  }
}

export class PathsParameter extends StringsParameter {
  type = "array:path"

  coerce(input?: string): string[] {
    const paths = super.coerce(input)
    return paths.map((p) => resolve(process.cwd(), p))
  }
}

export class IntegerParameter extends Parameter<number> {
  type = "number"
  schema = joi.number().integer()

  coerce(input: string) {
    const output = parseInt(input, 10)
    if (isNaN(output)) {
      throw new ParameterError(`Could not parse "${input}" as integer`, {
        expectedType: "integer",
        input,
      })
    }
    return output
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

  coerce(input: string) {
    if (this.choices.includes(input)) {
      return input
    } else {
      throw new ParameterError(
        `"${input}" is not a valid argument (should be any of ${this.choices.map((c) => `"${c}"`).join(", ")})`,
        {
          expectedType: `One of: ${this.choices.join(", ")}`,
          input,
        }
      )
    }
  }

  async autoComplete() {
    return this.choices
  }
}

export class BooleanParameter extends Parameter<boolean> {
  type = "boolean"
  schema = joi.boolean()

  constructor(args: ParameterConstructor<boolean>) {
    super(args)
    this.defaultValue = args.defaultValue || false
  }

  coerce(input: any) {
    if (input === true || input === "true" || input === "1" || input === "yes" || input === 1) {
      return true
    } else if (input === false || input === "false" || input === "0" || input === "no" || input === 0) {
      return false
    } else {
      throw new ParameterError(`Invalid boolean value: '${input}'`, { input })
    }
  }
}

export class EnvironmentOption extends StringParameter {
  type = "string"
  schema = joi.environment()

  constructor({ help = "The environment (and optionally namespace) to work against." } = {}) {
    super({
      help,
      required: false,
      alias: "e",
    })
  }

  validate(input: string | undefined) {
    if (!input) {
      return
    }
    // Validate the environment
    parseEnvironment(input)
    return input
  }
}

export type Parameters = { [key: string]: Parameter<any> }
export type ParameterValues<T extends Parameters> = {
  [P in keyof T]: T[P]["_valueType"]
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

export const globalOptions = {
  "root": new PathParameter({
    alias: "r",
    help:
      "Override project root directory (defaults to working directory). Can be absolute or relative to current directory.",
    defaultValue: process.cwd(),
  }),
  "silent": new BooleanParameter({
    alias: "s",
    help: "Suppress log output. Same as setting --logger-type=quiet.",
    defaultValue: false,
    cliOnly: true,
  }),
  "env": new EnvironmentOption(),
  "logger-type": new ChoicesParameter({
    choices: [...LOGGER_TYPES],
    help: deline`
      Set logger type.
      ${chalk.bold("fancy")} updates log lines in-place when their status changes (e.g. when tasks complete),
      ${chalk.bold("basic")} appends a new log line when a log line's status changes,
      ${chalk.bold("json")} same as basic, but renders log lines as JSON,
      ${chalk.bold("quiet")} suppresses all log output, same as --silent.
    `,
    cliOnly: true,
  }),
  "log-level": new ChoicesParameter({
    alias: "l",
    choices: getLogLevelChoices(),
    help: deline`
      Set logger level. Values can be either string or numeric and are prioritized from 0 to 5
      (highest to lowest) as follows: error: 0, warn: 1, info: 2, verbose: 3, debug: 4, silly: 5.`,
    hints: "[choice] [default: info] [error || 0, warn || 1, info || 2, verbose || 3, debug || 4, silly || 5]",
    defaultValue: LogLevel[LogLevel.info],
  }),
  "output": new ChoicesParameter({
    alias: "o",
    choices: Object.keys(OUTPUT_RENDERERS),
    help: "Output command result in specified format (note: disables progress logging and interactive functionality).",
  }),
  "emoji": new BooleanParameter({
    help: "Enable emoji in output (defaults to true if the environment supports it).",
    defaultValue: envSupportsEmoji(),
  }),
  "show-timestamps": new BooleanParameter({
    help: deline`
      Show timestamps with log output. When enabled, Garden will use the ${chalk.bold(
        "basic"
      )} logger. I.e., log status changes are rendered as new lines instead of being updated in-place.`,
    defaultValue: false,
  }),
  "yes": new BooleanParameter({
    alias: "y",
    help: "Automatically approve any yes/no prompts during execution.",
    defaultValue: false,
  }),
  "force-refresh": new BooleanParameter({
    help: "Force refresh of any caches, e.g. cached provider statuses.",
    defaultValue: false,
  }),
  "var": new StringsParameter({
    help:
      'Set a specific variable value, using the format <key>=<value>, e.g. `--var some-key=custom-value`. This will override any value set in your project configuration. You can specify multiple variables by separating with a comma, e.g. `--var key-a=foo,key-b="value with quotes"`.',
  }),
  "version": new BooleanParameter({
    alias: "v",
    help: "Show the current CLI version.",
  }),
  "help": new BooleanParameter({
    alias: "h",
    help: "Show help",
  }),
}

export type GlobalOptions = typeof globalOptions
