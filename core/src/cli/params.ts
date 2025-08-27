/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type Joi from "@hapi/joi"
import stripAnsi from "strip-ansi"
import stringify from "json-stringify-safe"

import type { DeepPrimitiveMap } from "../config/common.js"
import { joi } from "../config/common.js"
import { ParameterError } from "../exceptions.js"
import { parseEnvironment } from "../config/project.js"
import { getLogLevelChoices, LOGGER_TYPES, LogLevel } from "../logger/logger.js"
import { dedent, deline } from "../util/string.js"
import { safeDumpYaml } from "../util/serialization.js"
import { resolve } from "path"
import { isArray } from "lodash-es"
import { gardenEnv } from "../constants.js"
import { envSupportsEmoji } from "../logger/util.js"
import type { ConfigDump } from "../garden.js"
import { styles } from "../logger/styles.js"
import dotenv from "dotenv"

export const OUTPUT_RENDERERS = {
  json: (data: DeepPrimitiveMap) => {
    return stringify(data, null, 2)
  },
  yaml: (data: DeepPrimitiveMap) => {
    // Convert data to JSON object so that `safeDumpYaml` renders any errors.
    return safeDumpYaml(JSON.parse(stringify(data)), { noRefs: true })
  },
}

export type OutputRenderer = keyof typeof OUTPUT_RENDERERS

export const validDurationUnits = ["d", "h", "m", "s"]

function splitDuration(duration: string) {
  return duration
    .trim()
    .split(/([0-9]+)/)
    .filter(Boolean)
}

interface GetSuggestionsParams {
  configDump: ConfigDump
}

type GetSuggestionsCallback = (params: GetSuggestionsParams) => string[]

export interface ParameterConstructorParams<T> {
  help: string
  required?: boolean
  aliases?: string[]
  defaultValue?: T
  hints?: string
  overrides?: string[]
  cliDefault?: T
  cliOnly?: boolean
  hidden?: boolean
  spread?: boolean
  suggestionPriority?: number
  getSuggestions?: GetSuggestionsCallback
}

export abstract class Parameter<T> {
  abstract type: string
  abstract schema: Joi.Schema

  defaultValue: T | undefined
  readonly help: string
  readonly required: boolean
  readonly aliases?: string[]
  readonly hints?: string
  readonly overrides: string[]
  readonly hidden: boolean
  readonly spread: boolean

  private readonly _getSuggestions?: GetSuggestionsCallback
  public readonly suggestionPriority: number

  readonly cliDefault: T | undefined // Optionally specify a separate default for CLI invocation
  readonly cliOnly: boolean // If true, only expose in the CLI, and not in the HTTP/WS server.

  constructor({
    help,
    required,
    aliases,
    defaultValue,
    overrides,
    hints,
    cliDefault,
    cliOnly,
    hidden,
    spread,
    suggestionPriority,
    getSuggestions,
  }: ParameterConstructorParams<T>) {
    this.help = help
    this.required = required || false
    this.aliases = aliases
    this.hints = hints
    this.defaultValue = defaultValue
    this.overrides = overrides || []
    this.cliDefault = cliDefault
    this.cliOnly = cliOnly || false
    this.hidden = hidden || false
    this.spread = spread || false
    this.suggestionPriority = suggestionPriority || 1
    this._getSuggestions = getSuggestions
  }

  validate(input: T): T | undefined {
    // TODO: make sure the error is thrown,
    //  its thrown is nice and readable,
    //  and the output type is correct
    this.schema.validate(input)
    return input
  }

  coerce(input?: string): T {
    return input as unknown as T
  }

  getDefaultValue(cli: boolean) {
    return cli && this.cliDefault !== undefined ? this.cliDefault : this.defaultValue
  }

  getSuggestions(params: GetSuggestionsParams): string[] {
    if (this._getSuggestions) {
      return this._getSuggestions(params)
    } else {
      return []
    }
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

export interface StringsConstructorParams extends ParameterConstructorParams<string[]> {
  delimiter?: string
  spread?: boolean
}

export class StringsParameter extends Parameter<string[] | undefined> {
  type = "array:string"
  schema = joi.array().items(joi.string())

  delimiter: string | RegExp

  constructor(args: StringsConstructorParams) {
    super(args)

    // The default delimiter splits on commas, ignoring commas between double quotes
    this.delimiter = args.delimiter || /,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/
  }

  override coerce(input?: string | string[]): string[] {
    if (!input) {
      return []
    } else if (!isArray(input)) {
      input = [input]
    }
    return input.flatMap((v) => String(v).split(this.delimiter))
  }
}

export class PathParameter extends Parameter<string> {
  type = "path"
  schema = joi.string()

  override coerce(input?: string): string {
    return resolve(process.cwd(), input || ".")
  }
}

export class DurationParameter extends Parameter<string> {
  type = "moment"
  schema = joi.string()

  override coerce(input: string): string {
    const parts = splitDuration(input)
    const expectedType = dedent`
      Duration where unit is one of ${validDurationUnits.join(
        ", "
      )} and length is an integer. For example '1d', '10m', '20s'.
    `
    if (parts.length !== 2) {
      throw new ParameterError({
        message: `Could not parse "${input}" as duration. Expected: ${expectedType}`,
      })
    }
    const length = parseInt(parts[0], 10)
    const unit = parts[1]
    if (isNaN(length)) {
      throw new ParameterError({
        message: `Could not parse "${input}" as duration, length must be an integer. Received ${length}`,
      })
    }
    if (!validDurationUnits.includes(unit)) {
      throw new ParameterError({
        message: `Could not parse "${input}" as duration, unit must be one of ${validDurationUnits.join(
          ", "
        )}. Received ${unit}`,
      })
    }
    return input
  }
}

export class PathsParameter extends StringsParameter {
  override type = "array:path"

  override coerce(input?: string | string[]): string[] {
    const paths = super.coerce(input)
    return paths.map((p) => resolve(process.cwd(), p))
  }
}

export class IntegerParameter extends Parameter<number> {
  type = "number"
  schema = joi.number().integer()

  override coerce(input: string) {
    const output = parseInt(input, 10)
    if (isNaN(output)) {
      throw new ParameterError({
        message: `Could not parse "${input}" as integer`,
      })
    }
    return output
  }
}

export interface ChoicesConstructor extends ParameterConstructorParams<string> {
  choices: string[]
}

export class ChoicesParameter extends Parameter<string> {
  type = "choice"
  choices: string[]
  schema = joi.string()

  constructor(args: ChoicesConstructor) {
    super(args)

    this.choices = args.choices

    if (args.defaultValue !== undefined && !this.choices.includes(args.defaultValue)) {
      this.choices.push(args.defaultValue)
    }

    this.schema = joi.string().valid(...this.choices)
  }

  override coerce(input: string) {
    input = String(input)

    if (this.choices.includes(input)) {
      return input
    } else {
      throw new ParameterError({
        message: `"${input}" is not a valid argument (should be any of ${this.choices
          .map((c) => `"${c}"`)
          .join(", ")})`,
      })
    }
  }

  override getSuggestions() {
    return this.choices
  }
}

export class BooleanParameter extends Parameter<boolean> {
  type = "boolean"
  schema = joi.boolean()

  constructor(args: ParameterConstructorParams<boolean>) {
    super(args)
    this.defaultValue = args.defaultValue || false
  }

  override coerce(input: any) {
    if (input === true || input === "true" || input === "1" || input === "yes" || input === 1) {
      return true
    } else if (input === false || input === "false" || input === "0" || input === "no" || input === 0) {
      return false
    } else {
      throw new ParameterError({ message: `Invalid boolean value: '${input}'` })
    }
  }
}

export interface Tag {
  key: string
  value: string
}

/**
 * Similar to `StringsOption`, but doesn't split individual option values on `,`
 */
export class TagsOption extends Parameter<Tag[][] | undefined> {
  type = "array:tag"
  schema = joi.array().items(joi.array().items(joi.object().keys({ key: joi.string(), value: joi.string() })))

  override coerce(input?: string | string[]): Tag[][] {
    if (!input) {
      return []
    } else if (!isArray(input)) {
      input = [input]
    }

    const parameterErrorMsg = `Unable to parse the given input. Format should be key=value.`
    const output: Tag[][] = []
    try {
      for (const tagGroup of input) {
        const tags: Tag[] = []
        for (const t of tagGroup.split(",")) {
          const parsed = Object.entries(dotenv.parse(t))[0]
          if (!parsed) {
            throw new ParameterError({ message: `${parameterErrorMsg}. Got: '${t}'` })
          }
          tags.push({ key: parsed[0], value: parsed[1] })
        }
        output.push(tags)
      }
    } catch {
      throw new ParameterError({ message: `${parameterErrorMsg}. Got: '${input}'` })
    }

    return output
  }
}

export class EnvironmentParameter extends StringOption {
  override type = "string"
  override schema = joi.environment()

  constructor({ help = "The environment (and optionally namespace) to work against.", required = false } = {}) {
    super({
      help,
      required,
      aliases: ["e"],
      getSuggestions: ({ configDump }) => {
        return configDump.allEnvironmentNames
      },
    })
  }

  override validate(input: string | undefined) {
    if (!input) {
      return
    }

    // Validate the environment
    parseEnvironment(input)
    return input
  }

  override getDefaultValue() {
    return gardenEnv.GARDEN_ENVIRONMENT
  }
}

export type ParameterObject = { [key: string]: Parameter<any> }
export type ParameterValueType<P extends Parameter<any>> = P extends Parameter<infer T> ? T : never
export type ParameterValues<T extends ParameterObject> = {
  [P in keyof T]: ParameterValueType<T[P]>
}

export function describeParameters(args?: ParameterObject) {
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

export const globalDisplayOptions = {
  "silent": new BooleanParameter({
    help: "Suppress log output. Same as setting --logger-type=quiet.",
    defaultValue: false,
    cliOnly: true,
  }),
  "offline": new BooleanParameter({
    help: "Use the --offline option when you can't log in right now. Some features won't be available in offline mode.",
    defaultValue: false,
    cliOnly: true,
  }),
  "logger-type": new ChoicesParameter({
    choices: [...LOGGER_TYPES],
    help: deline`
      Set logger type.
      ${styles.highlight("default")} The default Garden logger,
      ${styles.highlight("basic")}: [DEPRECATED] An alias for "default".
      ${styles.highlight("json")}: Renders log lines as JSON.
      ${styles.highlight("quiet")}: Suppresses all log output, same as --silent.
    `,
    cliOnly: true,
  }),
  "log-level": new ChoicesParameter({
    aliases: ["l"],
    choices: getLogLevelChoices(),
    help: deline`
      Set logger level. Values can be either string or numeric and are prioritized from 0 to 5
      (highest to lowest) as follows: ${styles.highlight("error: 0")}, ${styles.highlight("warn: 1")},
      ${styles.highlight("info: 2")}, ${styles.highlight("verbose: 3")}, ${styles.highlight("debug: 4")},
      ${styles.highlight("silly: 5")}.
      From the verbose log level onward action execution logs are also printed (e.g. test or run live log outputs).`,
    hints: "[choice] [default: info] [error || 0, warn || 1, info || 2, verbose || 3, debug || 4, silly || 5]",
    defaultValue: LogLevel[LogLevel.info],
  }),
  "output": new ChoicesParameter({
    aliases: ["o"],
    choices: Object.keys(OUTPUT_RENDERERS),
    help: "Output command result in the specified format. When used, this option disables line-by-line logging, even if the GARDEN_LOGGER_TYPE environment variable is used.",
  }),
  "emoji": new BooleanParameter({
    help: "Enable emoji in output (defaults to true if the environment supports it).",
    defaultValue: envSupportsEmoji(),
  }),
  "show-timestamps": new BooleanParameter({
    help: deline`
      Show timestamps with log output. When enabled, Garden will use the ${styles.bold(
        "basic"
      )} logger. I.e., log status changes are rendered as new lines instead of being updated in-place.`,
    defaultValue: false,
  }),
  "version": new BooleanParameter({
    aliases: ["V"],
    help: "Show the current CLI version.",
  }),
  "help": new BooleanParameter({
    aliases: ["h"],
    help: "Show help",
  }),
}

export const globalGardenInstanceOptions = {
  "root": new PathParameter({
    help: "Override project root directory (defaults to working directory). Can be absolute or relative to current directory.",
  }),
  "env": new EnvironmentParameter(),
  "force-refresh": new BooleanParameter({
    help: "Force refresh of any caches, e.g. cached provider statuses.",
    defaultValue: false,
  }),
  "var": new StringsParameter({
    help: 'Set a specific variable value, using the format <key>=<value>, e.g. `--var some-key=custom-value`. This will override any value set in your project configuration. You can specify multiple variables by separating with a comma, e.g. `--var key-a=foo,key-b="value with quotes"`.',
  }),
  "yes": new BooleanParameter({
    aliases: ["y"],
    help: "Automatically approve any yes/no prompts during execution, and allow running protected commands against production environments.",
    defaultValue: false,
  }),
}

export const globalOptions = {
  ...globalGardenInstanceOptions,
  ...globalDisplayOptions,
}

export type GlobalOptions = typeof globalOptions
