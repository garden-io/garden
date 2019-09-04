/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import axios from "axios"
import chalk from "chalk"
import ci = require("ci-info")
import { pathExists } from "fs-extra"
import { difference, flatten, range, reduce } from "lodash"
import moment = require("moment")
import { platform, release } from "os"
import qs = require("qs")

import { ChoicesParameter, ParameterValues, Parameter } from "../commands/base"
import { InternalError } from "../exceptions"
import { LogLevel } from "../logger/log-node"
import { getEnumKeys, getPackageVersion } from "../util/util"
import { LogEntry } from "../logger/log-entry"
import { STATIC_DIR, VERSION_CHECK_URL } from "../constants"
import { printWarningMessage } from "../logger/util"
import { GlobalConfigStore, globalConfigKeys } from "../config-store"

// Parameter types T which map between the Parameter<T> class and the Sywac cli library.
// In case we add types that aren't supported natively by Sywac, see: http://sywac.io/docs/sync-config.html#custom
const VALID_PARAMETER_TYPES = ["boolean", "number", "choice", "string", "array:string", "path", "array:path"]

export const styleConfig = {
  usagePrefix: (str) =>
    `
${chalk.bold(str.slice(0, 5).toUpperCase())}
  ${chalk.italic(str.slice(7))}`,
  usageCommandPlaceholder: (str) => chalk.blue(str),
  usagePositionals: (str) => chalk.cyan(str),
  usageArgsPlaceholder: (str) => chalk.cyan(str),
  usageOptionsPlaceholder: (str) => chalk.yellow(str),
  group: (str: string) => {
    const cleaned = str.endsWith(":") ? str.slice(0, -1) : str
    return chalk.bold(cleaned.toUpperCase())
  },
  flags: (str, _type) => {
    const style = str.startsWith("-") ? chalk.green : chalk.cyan
    return style(str)
  },
  hints: (str) => chalk.gray(str),
  groupError: (str) => chalk.red.bold(str),
  flagsError: (str) => chalk.red.bold(str),
  descError: (str) => chalk.yellow.bold(str),
  hintsError: (str) => chalk.red(str),
  messages: (str) => chalk.red.bold(str), // these are error messages
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

/**
 * The maximum width of the help text that the CLI outputs. E.g. when running "garden --help" or "garden options".
 */
export function helpTextMaxWidth() {
  const cols = process.stdout.columns || 100
  return Math.min(100, cols)
}

// Add platforms/terminals?
export function envSupportsEmoji() {
  return (
    process.platform === "darwin" || process.env.TERM_PROGRAM === "Hyper" || process.env.TERM_PROGRAM === "HyperTerm"
  )
}

export type FalsifiedParams = { [key: string]: false }

/**
 * Returns the params that need to be overridden set to false
 */
export function negateConflictingParams(argv, params: ParameterValues<any>): FalsifiedParams {
  return reduce(
    argv,
    (acc: {}, val: any, key: string) => {
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

      withAliases.forEach((keyToOverride) => (acc[keyToOverride] = false))
      return acc
    },
    {}
  )
}

// Sywac specific transformers and helpers
export function getOptionSynopsis(key: string, { alias }: Parameter<any>): string {
  if (alias && alias.length > 1) {
    return `--${alias}, --${key}`
  } else if (alias) {
    return `-${alias}, --${key}`
  } else {
    return `--${key}`
  }
}

export function getArgSynopsis(key: string, param: Parameter<any>) {
  return param.required ? `<${key}>` : `[${key}]`
}

const getLogLevelNames = () => getEnumKeys(LogLevel)
const getNumericLogLevels = () => range(getLogLevelNames().length)
// Allow string or numeric log levels as CLI choices
export const getLogLevelChoices = () => [...getLogLevelNames(), ...getNumericLogLevels().map(String)]

export function parseLogLevel(level: string): LogLevel {
  let lvl: LogLevel
  const parsed = parseInt(level, 10)
  // Level is numeric
  if (parsed || parsed === 0) {
    lvl = parsed
    // Level is a string
  } else {
    lvl = LogLevel[level]
  }
  if (!getNumericLogLevels().includes(lvl)) {
    throw new InternalError(
      `Unexpected log level, expected one of ${getLogLevelChoices().join(", ")}, got ${level}`,
      {}
    )
  }
  return lvl
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
  const { coerce, help: desc, hints, required, type } = param

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
  const validOptions = flatten(ctx.details.types.filter((t) => t.datatype !== "command").map((t) => t.aliases))
  const receivedOptions = Object.keys(argv)
  const invalid = difference(receivedOptions, validOptions)
  if (invalid.length > 0) {
    ctx.cliMessage(`Received invalid flag(s): ${invalid.join(", ")}`)
  }
}

export async function checkForStaticDir() {
  if (!(await pathExists(STATIC_DIR))) {
    throw new InternalError(
      `Could not find the static data directory. Garden is packaged with a data directory ` +
        `called 'static', which should be located next to your garden binary. Please try reinstalling, ` +
        `and make sure the release archive is fully extracted to the target directory.`,
      {}
    )
  }
}

export async function checkForUpdates(config: GlobalConfigStore, logger: LogEntry) {
  if (process.env.GARDEN_DISABLE_VERSION_CHECK === "true") {
    return
  }

  const query = {
    gardenVersion: getPackageVersion(),
    platform: platform(),
    platformVersion: release(),
  }
  try {
    const globalConfig = await config.get()
    const headers = {}
    headers["X-user-id"] = globalConfig.analytics ? globalConfig.analytics.userId : "unknown"
    headers["X-ci-check"] = ci.isCI
    if (ci.isCI) {
      headers["X-ci-name"] = ci.name
    }

    const res = await axios.get(`${VERSION_CHECK_URL}?${qs.stringify(query)}`, { headers })
    const configObj = await config.get()
    const showMessage =
      configObj.lastVersionCheck &&
      moment()
        .subtract(1, "days")
        .isAfter(moment(configObj.lastVersionCheck.lastRun))

    // we check again for lastVersionCheck because in the first run it doesn't exist
    if (showMessage || !configObj.lastVersionCheck) {
      if (res.data.status === "OUTDATED") {
        printWarningMessage(logger, res.data.message)
        await config.set([globalConfigKeys.lastVersionCheck], { lastRun: new Date() })
      }
    }
  } catch (err) {
    logger.verbose("Something went wrong while checking for the latest Garden version.")
    logger.verbose(err)
  }
}
