/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import ci = require("ci-info")
import { pathExists } from "fs-extra"
import { range, sortBy, max, isEqual, mapValues, pickBy } from "lodash"
import moment from "moment"
import { platform, release } from "os"
import qs from "qs"
import stringWidth from "string-width"
import { maxBy, zip } from "lodash"

import { ParameterValues, Parameter, Parameters } from "./params"
import { InternalError, ParameterError } from "../exceptions"
import { getPackageVersion } from "../util/util"
import { LogEntry } from "../logger/log-entry"
import { STATIC_DIR, VERSION_CHECK_URL, gardenEnv } from "../constants"
import { printWarningMessage } from "../logger/util"
import { GlobalConfigStore, globalConfigKeys } from "../config-store"
import { got, GotResponse } from "../util/http"
import { getUserId } from "../analytics/analytics"
import minimist = require("minimist")
import { renderTable, tablePresets, naturalList } from "../util/string"
import { globalOptions, GlobalOptions } from "./params"
import { Command, CommandGroup } from "../commands/base"

export const cliStyles = {
  heading: (str: string) => chalk.white.bold(str),
  commandPlaceholder: () => chalk.blueBright("<command>"),
  optionsPlaceholder: () => chalk.yellowBright("[options]"),
  hints: (str: string) => chalk.gray(str),
  usagePositional: (key: string, required: boolean) => chalk.cyan(required ? `<${key}>` : `[${key}]`),
  usageOption: (str: string) => chalk.cyan(`<${str}>`),
}

/**
 * The maximum width of the help text that the CLI outputs. E.g. when running "garden --help" or "garden options".
 */
export function helpTextMaxWidth() {
  const cols = process.stdout.columns || 100
  return Math.min(120, cols)
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
  if (gardenEnv.GARDEN_DISABLE_VERSION_CHECK) {
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
    headers["X-user-id"] = getUserId(globalConfig)
    headers["X-ci-check"] = ci.isCI
    if (ci.isCI) {
      headers["X-ci-name"] = ci.name
    }

    const res = await got(`${VERSION_CHECK_URL}?${qs.stringify(query)}`, { headers }).json<GotResponse<any>>()
    const configObj = await config.get()
    const showMessage =
      configObj.lastVersionCheck && moment().subtract(1, "days").isAfter(moment(configObj.lastVersionCheck.lastRun))

    // we check again for lastVersionCheck because in the first run it doesn't exist
    if (showMessage || !configObj.lastVersionCheck) {
      if (res.body.status === "OUTDATED") {
        printWarningMessage(logger, res.body.message)
        await config.set([globalConfigKeys.lastVersionCheck], { lastRun: new Date() })
      }
    }
  } catch (err) {
    logger.verbose("Something went wrong while checking for the latest Garden version.")
    logger.verbose(err)
  }
}

export function pickCommand(commands: (Command | CommandGroup)[], args: string[]) {
  // Sorting by reverse path length to make sure we pick the most specific command
  const command = sortBy(commands, (cmd) => -cmd.getPath().length).find((c) => {
    for (const path of c.getPaths()) {
      if (isEqual(path, args.slice(0, path.length))) {
        return true
      }
    }
    return false
  })

  const rest = command ? args.slice(command.getPath().length) : args
  return { command, rest }
}

export type ParamSpec = {
  [key: string]: Parameter<string | string[] | number | boolean | undefined>
}

/**
 * Parses the given CLI arguments using minimist. The result should be fed to `processCliArgs()`
 *
 * @param stringArgs  Raw string arguments
 * @param command     The Command that the arguments are for, if any
 * @param cli         If true, prefer `param.cliDefault` to `param.defaultValue`
 * @param skipDefault Defaults to `false`. If `true`, don't populate default values.
 */
export function parseCliArgs({
  stringArgs,
  command,
  cli,
  skipDefault = false,
}: {
  stringArgs: string[]
  command?: Command
  cli: boolean
  skipDefault?: boolean
}) {
  // Tell minimist which flags are to be treated explicitly as booleans and strings
  const allOptions = { ...globalOptions, ...(command?.options || {}) }
  const booleanKeys = Object.keys(pickBy(allOptions, (spec) => spec.type === "boolean"))
  const stringKeys = Object.keys(pickBy(allOptions, (spec) => spec.type !== "boolean" && spec.type !== "number"))

  // Specify option flag aliases
  const aliases = {}
  const defaultValues = {}

  for (const [name, spec] of Object.entries(allOptions)) {
    if (!skipDefault) {
      defaultValues[name] = spec.getDefaultValue(cli)
    }

    if (spec.alias) {
      aliases[name] = spec.alias
      if (!skipDefault) {
        defaultValues[spec.alias] = defaultValues[name]
      }
    }
  }

  return minimist(stringArgs, {
    "--": true,
    "boolean": booleanKeys,
    "string": stringKeys,
    "alias": aliases,
    "default": defaultValues,
  })
}

interface DefaultArgs {
  // Contains anything after -- on the command line
  _: string[]
}

/**
 * Takes parsed arguments (as returned by `parseCliArgs()`) and a Command, validates them, and
 * returns args and opts ready to pass to that command's action method.
 *
 * @param parsedArgs  Parsed arguments from `parseCliArgs()`
 * @param command     The Command that the arguments are for
 * @param cli         Set to false if `cliOnly` options should be ignored
 */
export function processCliArgs<A extends Parameters, O extends Parameters>({
  parsedArgs,
  command,
  cli,
}: {
  parsedArgs: minimist.ParsedArgs
  command: Command<A, O>
  cli: boolean
}) {
  const argSpec = command.arguments || <A>{}
  const argKeys = Object.keys(argSpec)
  const processedArgs = { _: parsedArgs["--"] || [] }

  const errors: string[] = []

  for (const idx of range(argKeys.length)) {
    const argKey = argKeys[idx]
    const argVal = parsedArgs._[idx]
    const spec = argSpec[argKey]

    // Ensure all required positional arguments are present
    if (!argVal) {
      if (spec.required) {
        errors.push(`Missing required argument ${chalk.white.bold(argKey)}`)
      }

      // Commands expect unused arguments to be explicitly set to undefined.
      processedArgs[argKeys[idx]] = undefined
    }
  }

  // TODO: support variadic arguments
  for (const idx of range(parsedArgs._.length)) {
    const argKey = argKeys[idx]
    const argVal = parsedArgs._[idx]
    const spec = argSpec[argKey]

    if (!spec) {
      const expected = argKeys.length > 0 ? "only " + naturalList(argKeys.map((key) => chalk.white.bold(key))) : "none"
      throw new ParameterError(`Unexpected positional argument "${argVal}" (expected ${expected})`, {
        expectedKeys: argKeys,
        extraValue: argVal,
      })
    }

    try {
      processedArgs[argKey] = spec.validate(spec.coerce(argVal))
    } catch (error) {
      throw new ParameterError(`Invalid value for argument ${chalk.white.bold(argKey)}: ${error.message}`, {
        error,
        key: argKey,
        value: argVal,
      })
    }
  }

  const optSpec = { ...globalOptions, ...(command.options || {}) }
  const optsWithAliases: { [key: string]: Parameter<any> } = {}

  // Apply default values
  const processedOpts = mapValues(optSpec, (spec) => spec.getDefaultValue(cli))

  for (const [name, spec] of Object.entries(optSpec)) {
    optsWithAliases[name] = spec
    if (spec.alias) {
      optsWithAliases[spec.alias] = spec
    }
  }

  for (let [key, value] of Object.entries(parsedArgs)) {
    if (key === "_" || key === "--") {
      continue
    }

    const spec = optsWithAliases[key]
    const flagStr = chalk.white.bold(key.length === 1 ? "-" + key : "--" + key)

    if (!spec) {
      errors.push(`Unrecognized option flag ${flagStr}`)
      continue
    }

    if (!optSpec[key]) {
      // Don't double-process the aliases
      continue
    }

    if (!cli && spec.cliOnly) {
      // ignore cliOnly flags if cli=false
      continue
    }

    if (Array.isArray(value)) {
      // TODO: support multiple instances of an argument if it's an array type
      value = value[value.length - 1] // Use the last value if the option is used multiple times
    }

    if (value !== undefined) {
      try {
        value = spec.validate(spec.coerce(value))
        processedOpts[key] = value
      } catch (err) {
        errors.push(`Invalid value for option ${flagStr}: ${err.message}`)
      }
    }
  }

  if (errors.length > 0) {
    throw new ParameterError(chalk.red.bold(errors.join("\n")), { parsedArgs, processedArgs, processedOpts, errors })
  }

  return {
    args: <DefaultArgs & ParameterValues<A>>processedArgs,
    opts: <ParameterValues<GlobalOptions> & ParameterValues<O>>processedOpts,
  }
}

export function renderCommands(commands: Command[]) {
  if (commands.length === 0) {
    return "\n"
  }

  const sortedCommands = sortBy(commands, (cmd) => cmd.getFullName())

  const rows = sortedCommands.map((command) => {
    return [` ${chalk.cyan(command.getFullName())}`, command.help]
  })

  const maxCommandLength = max(rows.map((r) => r[0]!.length))!

  return renderTable(rows, {
    ...tablePresets["no-borders"],
    colWidths: [null, helpTextMaxWidth() - maxCommandLength - 2],
  })
}

export function renderArguments(params: Parameters) {
  return renderParameters(params, (name, param) => {
    return " " + cliStyles.usagePositional(name, param.required)
  })
}

export function renderOptions(params: Parameters) {
  return renderParameters(params, (name, param) => {
    const alias = param.alias ? `-${param.alias}, ` : ""
    return chalk.green(` ${alias}--${name} `)
  })
}

function renderParameters(params: Parameters, formatName: (name: string, param: Parameter<any>) => string) {
  const sortedParams = Object.keys(params).sort()

  const names = sortedParams.map((name) => formatName(name, params[name]))

  const helpTexts = sortedParams.map((name) => {
    const param = params[name]
    let out = param.help
    let hints = ""
    if (param.hints) {
      hints = param.hints
    } else {
      hints = `\n[${param.type}]`
      if (param.defaultValue) {
        hints += ` [default: ${param.defaultValue}]`
      }
    }
    return out + chalk.gray(hints)
  })

  const nameColWidth = stringWidth(maxBy(names, (n) => stringWidth(n)) || "") + 2
  const textColWidth = helpTextMaxWidth() - nameColWidth

  return renderTable(zip(names, helpTexts), {
    ...tablePresets["no-borders"],
    colWidths: [nameColWidth, textColWidth],
  })
}
