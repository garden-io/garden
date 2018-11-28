/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { difference, flatten, reduce } from "lodash"
import {
  ChoicesParameter,
  ParameterValues,
  Parameter,
} from "../commands/base"
import {
  InternalError,
} from "../exceptions"

// Parameter types T which map between the Parameter<T> class and the Sywac cli library.
// In case we add types that aren't supported natively by Sywac, see: http://sywac.io/docs/sync-config.html#custom
const VALID_PARAMETER_TYPES = ["boolean", "number", "choice", "string", "array:string", "path", "array:path"]

export const styleConfig = {
  usagePrefix: str => (
    `
${chalk.bold(str.slice(0, 5).toUpperCase())}
  ${chalk.italic(str.slice(7))}`
  ),
  usageCommandPlaceholder: str => chalk.blue(str),
  usagePositionals: str => chalk.cyan(str),
  usageArgsPlaceholder: str => chalk.cyan(str),
  usageOptionsPlaceholder: str => chalk.yellow(str),
  group: (str: string) => {
    const cleaned = str.endsWith(":") ? str.slice(0, -1) : str
    return chalk.bold(cleaned.toUpperCase())
  },
  flags: (str, _type) => {
    const style = str.startsWith("-") ? chalk.green : chalk.cyan
    return style(str)
  },
  hints: str => chalk.gray(str),
  groupError: str => chalk.red.bold(str),
  flagsError: str => chalk.red.bold(str),
  descError: str => chalk.yellow.bold(str),
  hintsError: str => chalk.red(str),
  messages: str => chalk.red.bold(str), // these are error messages
}

// Helper functions
export const getKeys = (obj): string[] => Object.keys(obj || {})
export const filterByKeys = (obj: any, keys: string[]): any => {
  return keys.reduce((memo, key) => {
    if (obj.hasOwnProperty(key)) {
      memo[key] = obj[key]
    }
    return memo
  }, {})
}

// Add platforms/terminals?
export function envSupportsEmoji() {
  return process.platform === "darwin"
    || process.env.TERM_PROGRAM === "Hyper"
    || process.env.TERM_PROGRAM === "HyperTerm"
}

export type FalsifiedParams = { [key: string]: false }

/**
 * Returns the params that need to be overridden set to false
 */
export function falsifyConflictingParams(argv, params: ParameterValues<any>): FalsifiedParams {
  return reduce(argv, (acc: {}, val: any, key: string) => {
    const param = params[key]
    const overrides = (param || {}).overrides || []
    // argv always contains the "_" key which is irrelevant here
    if (key === "_" || !param || !val || !(overrides.length > 0)) {
      return acc
    }
    const withAliases = overrides.reduce((_, keyToOverride: string): string[] => {
      if (!params[keyToOverride]) {
        throw new InternalError(`Cannot override non-existing parameter: ${keyToOverride}`, {
          keyToOverride,
          availableKeys: Object.keys(params),
        })
      }
      return [keyToOverride, ...params[keyToOverride].alias]
    }, [])

    withAliases.forEach(keyToOverride => acc[keyToOverride] = false)
    return acc
  }, {})
}

// Sywac specific transformers and helpers
export function getOptionSynopsis(key: string, { alias }: Parameter<any>): string {
  if (alias && alias.length > 1) {
    throw new InternalError("Option aliases can only be a single character", {
      optionName: key,
      alias,
    })
  }
  return alias ? `-${alias}, --${key}` : `--${key}`
}

export function getArgSynopsis(key: string, param: Parameter<any>) {
  return param.required ? `<${key}>` : `[${key}]`
}

export function prepareArgConfig(param: Parameter<any>) {
  return {
    desc: param.help,
    params: [prepareOptionConfig(param)],
  }
}

export interface SywacOptionConfig {
  desc: string | string[]
  type: string
  defaultValue?: any
  coerce?: Function
  choices?: any[]
  required?: boolean
  hints?: string
  strict: true
  mustExist: true // For parameters of path type
}

export function prepareOptionConfig(param: Parameter<any>): SywacOptionConfig {
  const {
    coerce,
    help: desc,
    hints,
    required,
    type,
  } = param

  const defaultValue = param.cliDefault === undefined ? param.defaultValue : param.cliDefault

  if (!VALID_PARAMETER_TYPES.includes(type)) {
    throw new InternalError(`Invalid parameter type for cli: ${type}`, {
      type,
      validParameterTypes: VALID_PARAMETER_TYPES,
    })
  }
  let config: SywacOptionConfig = {
    coerce,
    defaultValue,
    desc,
    required,
    type,
    hints,
    strict: true,
    mustExist: true, // For parameters of path type
  }
  if (type === "choice") {
    config.type = "enum"
    config.choices = (<ChoicesParameter>param).choices
  }
  return config
}

export function failOnInvalidOptions(argv, ctx) {
  const validOptions = flatten(
    ctx.details.types
      .filter(t => t.datatype !== "command")
      .map(t => t.aliases),
  )
  const receivedOptions = Object.keys(argv)
  const invalid = difference(receivedOptions, validOptions)
  if (invalid.length > 0) {
    ctx.cliMessage(`Received invalid flag(s): ${invalid.join(", ")}`)
  }
}
