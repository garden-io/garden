import { GardenContext } from "../context"
import { LoggerInstance } from "winston"

export class ValidationError extends Error { }

interface ArgumentConstructor {
  help: string,
  required?: boolean,
  alias?: string,
  defaultValue?: any,
  valueName?: string,
}

export abstract class Argument {
  abstract type: string
  abstract value: any

  help: string
  required: boolean
  alias?: string
  valueName: string

  constructor({ help, required, alias, defaultValue, valueName }: ArgumentConstructor) {
    this.help = help
    this.required = required || false
    this.alias = alias
    this.value = defaultValue
    this.valueName = valueName || "value"
  }

  abstract setValue(input: string): void

  async autoComplete(): Promise<string[]> {
    return []
  }
}

export type Arguments = { [key: string]: Argument }

export class StringParameter extends Argument {
  type: "string"
  value: string

  setValue(input: string) {
    this.value = input
  }
}

export class NumberParameter extends Argument {
  type: "number"
  value: number

  setValue(input: string) {
    try {
      this.value = parseInt(input, 10)
    } catch {
      throw new ValidationError(`Could not parse "${input}" as number`)
    }
  }
}

interface ChoicesConstructor extends ArgumentConstructor {
  choices: string[],
}

export class ChoicesParameter extends Argument {
  type: "choice"
  value: string
  choices: string[]

  constructor(args: ChoicesConstructor) {
    super(args)

    this.choices = args.choices
  }

  setValue(input: string) {
    if (this.choices.includes(input)) {
      this.value = input
    } else {
      throw new ValidationError(`"${input}" is not a valid argument`)
    }
  }

  async autoComplete() {
    return this.choices
  }
}

export class BooleanParameter extends Argument {
  type: "boolean"
  value: boolean

  setValue(input: any) {
    this.value = true
  }
}

export abstract class Command<T extends Arguments = {}, U extends Arguments = {}> {
  abstract name: string
  abstract help: string

  alias?: string

  arguments: T
  options: U

  constructor() { }

  abstract async action(context: GardenContext, args: T, opts: U): Promise<void>
}
