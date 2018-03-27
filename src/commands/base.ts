import { GardenContext } from "../context"

export class ValidationError extends Error { }

interface ParameterConstructor<T> {
  help: string,
  required?: boolean,
  alias?: string,
  defaultValue?: T,
  valueName?: string,
  overrides?: string[],
}

export abstract class Parameter<T> {
  abstract type: string

  _valueType: T

  defaultValue: T | undefined
  help: string
  required: boolean
  alias?: string
  valueName: string
  overrides: string[]

  constructor({ help, required, alias, defaultValue, valueName, overrides }: ParameterConstructor<T>) {
    this.help = help
    this.required = required || false
    this.alias = alias
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

interface ChoicesConstructor extends ParameterConstructor<string> {
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
export type ParameterValues<T extends Parameters> = {[P in keyof T]: T["_valueType"]}

export abstract class Command<T extends Parameters = {}, U extends Parameters = {}> {
  abstract name: string
  abstract help: string

  alias?: string

  arguments: T
  options: U

  constructor() { }

  // Note: Due to a current TS limitation (apparently covered by https://github.com/Microsoft/TypeScript/issues/7011),
  // subclass implementations need to explicitly set the types in the implemented function signature. So for now we
  // can't enforce the types of `args` and `opts` automatically at the abstract class level and have to specify
  // the types explicitly on the subclassed methods.
  abstract async action(ctx: GardenContext, args: ParameterValues<T>, opts: ParameterValues<U>): Promise<any>
}
