/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  GardenError,
  RuntimeError,
} from "../exceptions"
import { PluginContext } from "../plugin-context"
import { TaskResults } from "../task-graph"
import { LoggerType } from "../logger/types"
import { ProcessResults } from "../process"

export class ValidationError extends Error { }

export interface ParameterConstructor<T> {
  help: string,
  required?: boolean,
  alias?: string,
  defaultValue?: T,
  valueName?: string,
  hints?: string,
  overrides?: string[],
}

export abstract class Parameter<T> {
  abstract type: string

  _valueType: T

  defaultValue: T | undefined
  help: string
  required: boolean
  alias?: string
  hints?: string
  valueName: string
  overrides: string[]

  constructor({ help, required, alias, defaultValue, valueName, overrides, hints }: ParameterConstructor<T>) {
    this.help = help
    this.required = required || false
    this.alias = alias
    this.hints = hints
    this.defaultValue = defaultValue
    this.valueName = valueName || "_valueType"
    this.overrides = overrides || []
  }

  abstract validate(input: string): T

  async autoComplete(): Promise<string[]> {
    return []
  }
}

export class StringParameter extends Parameter<string> {
  type = "string"

  validate(input: string) {
    return input
  }
}

export class NumberParameter extends Parameter<number> {
  type = "number"

  validate(input: string) {
    try {
      return parseInt(input, 10)
    } catch {
      throw new ValidationError(`Could not parse "${input}" as number`)
    }
  }
}

export interface ChoicesConstructor extends ParameterConstructor<string> {
  choices: string[],
}

export class ChoicesParameter extends Parameter<string> {
  type = "choice"
  choices: string[]

  constructor(args: ChoicesConstructor) {
    super(args)

    this.choices = args.choices
  }

  validate(input: string) {
    if (this.choices.includes(input)) {
      return input
    } else {
      throw new ValidationError(`"${input}" is not a valid argument`)
    }
  }

  async autoComplete() {
    return this.choices
  }
}

export class BooleanParameter extends Parameter<boolean> {
  type = "boolean"

  validate(input: any) {
    return !!input
  }
}

// TODO: maybe this should be a global option?
export class EnvironmentOption extends StringParameter {
  constructor({ help = "The environment (and optionally namespace) to work against" } = {}) {
    super({
      help,
      required: false,
      alias: "e",
    })
  }
}

export type Parameters = { [key: string]: Parameter<any> }
export type ParameterValues<T extends Parameters> = { [P in keyof T]: T["_valueType"] }

export interface CommandConstructor {
  new(parent?: Command): Command
}

export interface CommandResult<T = any> {
  result?: T
  restartRequired?: boolean
  errors?: GardenError[]
}

export abstract class Command<T extends Parameters = {}, U extends Parameters = {}> {
  abstract name: string
  abstract help: string

  description?: string

  alias?: string
  loggerType?: LoggerType

  arguments?: T
  options?: U

  subCommands: CommandConstructor[] = []

  constructor(private parent?: Command) { }

  getFullName() {
    return !!this.parent ? `${this.parent.getFullName()} ${this.name}` : this.name
  }

  describe() {
    const { name, help, description } = this

    return {
      name,
      fullName: this.getFullName(),
      help,
      description,
      arguments: describeParameters(this.arguments),
      options: describeParameters(this.options),
    }
  }

  // Note: Due to a current TS limitation (apparently covered by https://github.com/Microsoft/TypeScript/issues/7011),
  // subclass implementations need to explicitly set the types in the implemented function signature. So for now we
  // can't enforce the types of `args` and `opts` automatically at the abstract class level and have to specify
  // the types explicitly on the subclassed methods.
  abstract async action(ctx: PluginContext, args: ParameterValues<T>, opts: ParameterValues<U>): Promise<CommandResult>
}

export async function handleTaskResults(
  ctx: PluginContext, taskType: string, results: ProcessResults,
): Promise<CommandResult<TaskResults>> {
  const failed = Object.values(results).filter(r => !!r.error).length

  if (failed) {
    const error = new RuntimeError(`${failed} ${taskType} task(s) failed!`, {
      results,
    })
    return { errors: [error] }
  }

  ctx.log.info("")
  if (!results.restartRequired) {
    ctx.log.header({ emoji: "heavy_check_mark", command: `Done!` })
  }
  return {
    result: results.taskResults,
    restartRequired: results.restartRequired,
  }
}

export function describeParameters(args?: Parameters) {
  if (!args) { return }
  return Object.entries(args).map(([argName, arg]) => ({
    name: argName,
    usageName: arg.required ? `<${argName}>` : `[${argName}]`,
    ...arg,
  }))
}
