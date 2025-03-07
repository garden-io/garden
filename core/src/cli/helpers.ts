/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import ci from "ci-info"
import dotenv from "dotenv"
import fsExtra from "fs-extra"

const { pathExists } = fsExtra
import { range, sortBy, max, isEqual, mapValues, pickBy, memoize, indexOf } from "lodash-es"
import moment from "moment"
import { platform, release } from "os"
import qs from "qs"
import stringWidth from "string-width"
import { maxBy, zip } from "lodash-es"
import type { Logger } from "../logger/logger.js"

import type { ParameterValues, Parameter, ParameterObject } from "./params.js"
import { globalDisplayOptions } from "./params.js"
import { GardenError, ParameterError, RuntimeError, toGardenError } from "../exceptions.js"
import { getPackageVersion, removeSlice } from "../util/util.js"
import type { Log } from "../logger/log-entry.js"
import { STATIC_DIR, gardenEnv, ERROR_LOG_FILENAME } from "../constants.js"
import { printWarningMessage } from "../logger/util.js"
import type { GlobalConfigStore } from "../config-store/global.js"
import { got } from "../util/http.js"
import minimist from "minimist"
import { renderTable, tablePresets, naturalList, deline } from "../util/string.js"
import type { GlobalOptions } from "./params.js"
import { globalOptions } from "./params.js"
import type { BuiltinArgs, Command, CommandGroup } from "../commands/base.js"
import type { DeepPrimitiveMap } from "../config/common.js"
import { validateGitInstall } from "../vcs/vcs.js"
import { styles } from "../logger/styles.js"

export const cliStyles = {
  heading: (str: string) => styles.accent.bold(str),
  commandPlaceholder: () => styles.command("<command>"),
  argumentsPlaceholder: () => styles.highlight("[arguments]"),
  optionsPlaceholder: () => styles.warning("[options]"),
  hints: (str: string) => styles.primary(str),
  usagePositional: (key: string, required: boolean, spread: boolean) => {
    if (spread) {
      key += " ..."
    }

    return styles.highlight(required ? `<${key}>` : `[${key}]`)
  },
  usageOption: (str: string) => styles.highlight(`<${str}>`),
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
    // if this happens, this is most likely not a Garden bug but some kind of corrupted installation, and the user needs to do something about it.
    throw new RuntimeError({
      message: deline`
        Could not find the static data directory. Garden is packaged with a data directory
        called 'static', which should be located next to your garden binary. Please try reinstalling,
        and make sure the release archive is fully extracted to the target directory.
      `,
    })
  }
}

/**
 * checks if requirements to run garden are installed, throws if they are not
 */
export async function checkRequirements() {
  await validateGitInstall()
}

export async function checkForUpdates(config: GlobalConfigStore, logger: Log) {
  if (gardenEnv.GARDEN_DISABLE_VERSION_CHECK) {
    return
  }

  const query = {
    gardenVersion: getPackageVersion(),
    platform: platform(),
    platformVersion: release(),
  }

  const userId = (await config.get("analytics")).anonymousUserId || "unknown"
  const headers = {}
  headers["X-user-id"] = userId
  headers["X-ci-check"] = ci.isCI
  if (ci.isCI) {
    headers["X-ci-name"] = ci.name
  }

  const res = await got(`${gardenEnv.GARDEN_VERSION_CHECK_ENDPOINT}?${qs.stringify(query)}`, { headers }).json<any>()
  const versionCheck = await config.get("versionCheck")
  const showMessage = versionCheck && moment().subtract(1, "days").isAfter(moment(versionCheck.lastRun))

  // we check again for lastVersionCheck because in the first run it doesn't exist
  if (showMessage || !versionCheck?.lastRun) {
    if (res.status === "OUTDATED") {
      res.message && printWarningMessage(logger, res.message)
      await config.set("versionCheck", { lastRun: new Date() })
    }
  }
}

export interface PickCommandResult {
  command: Command<{}, {}> | CommandGroup | undefined
  rest: string[]
  matchedPath: undefined
}

export function pickCommand(commands: (Command | CommandGroup)[], args: string[]): PickCommandResult {
  // Sorting by reverse path length to make sure we pick the most specific command
  let matchedPath: string[] | undefined = undefined

  const command = sortBy(commands, (cmd) => -cmd.getPath().length).find((c) => {
    for (const path of c.getPaths()) {
      if (isEqual(path, args.slice(0, path.length))) {
        matchedPath = path
        return true
      }
    }
    return false
  })

  const rest = command ? args.slice(command.getPath().length) : args
  return { command, rest, matchedPath }
}

export function prepareMinimistOpts({
  options,
  cli,
  skipDefault = false,
  skipGlobalDefault = false,
}: {
  options: { [key: string]: Parameter<any> }
  cli: boolean
  skipDefault?: boolean
  skipGlobalDefault?: boolean
}) {
  // Tell minimist which flags are to be treated explicitly as booleans and strings
  const booleanKeys = Object.keys(pickBy(options, (spec) => spec.type === "boolean"))
  const stringKeys = Object.keys(pickBy(options, (spec) => spec.type !== "boolean" && spec.type !== "number"))

  // Specify option flag aliases
  const aliases = {}
  const defaultValues = {}

  for (const [name, spec] of Object.entries(options)) {
    const _skipDefault = skipDefault || (globalOptions[name] && skipGlobalDefault)

    if (!_skipDefault) {
      defaultValues[name] = spec.getDefaultValue(cli)
    }
    if (!aliases[name]) {
      aliases[name] = []
    }

    for (const alias of spec.aliases || []) {
      aliases[name].push(alias)
      if (!_skipDefault) {
        defaultValues[alias] = defaultValues[name]
      }
    }
  }

  return {
    boolean: booleanKeys,
    string: stringKeys,
    alias: aliases,
    default: defaultValues,
  }
}

/**
 * Parses the given CLI arguments using minimist. The result should be fed to `processCliArgs()`
 *
 * @param stringArgs  Raw string arguments
 * @param command     The Command that the arguments are for, if any
 * @param cli         If true, prefer `param.cliDefault` to `param.defaultValue`
 * @param skipDefault Defaults to `false`. If `true`, don't populate default values.
 */
export function parseCliArgs(params: {
  stringArgs: string[]
  command?: Command
  cli: boolean
  skipDefault?: boolean
  skipGlobalDefault?: boolean
}) {
  const opts = prepareMinimistOpts({
    options: { ...globalOptions, ...(params.command?.options || {}) },
    ...params,
  })

  const { stringArgs } = params

  return minimist(stringArgs, {
    ...opts,
    "--": true,
  })
}

/**
 * Takes parsed arguments (as returned by `parseCliArgs()`) and a Command, validates them, and
 * returns args and opts ready to pass to that command's action method.
 *
 * @param parsedArgs  Parsed arguments from `parseCliArgs()`
 * @param command     The Command that the arguments are for
 * @param cli         Set to false if `cliOnly` options should be ignored
 */
export function processCliArgs<A extends ParameterObject, O extends ParameterObject>({
  log,
  rawArgs,
  parsedArgs,
  command,
  matchedPath,
  cli,
  inheritedOpts,
  warnOnGlobalOpts,
}: {
  log?: Log
  rawArgs: string[]
  parsedArgs: minimist.ParsedArgs
  command: Command<A, O>
  matchedPath?: string[]
  cli: boolean
  inheritedOpts?: Partial<ParameterValues<GlobalOptions>>
  warnOnGlobalOpts?: boolean
}) {
  const parsed = parseCliArgs({ stringArgs: rawArgs, cli, skipDefault: true })
  const commandName = matchedPath || command.getPath()
  const all = removeSlice(rawArgs, commandName)

  const argSpec = command.arguments || <A>{}
  const argKeys = Object.keys(argSpec)
  const processedArgs = { "$all": all, "--": parsed["--"] || [] }

  const errors: string[] = []

  for (const idx of range(argKeys.length)) {
    const argKey = argKeys[idx]
    const argVal = parsedArgs._[idx]
    const spec = argSpec[argKey]

    // Ensure all required positional arguments are present
    if (!argVal) {
      if (spec.required) {
        errors.push(`Missing required argument ${styles.accent.bold(argKey)}`)
      }

      // Commands expect unused arguments to be explicitly set to undefined.
      processedArgs[argKeys[idx]] = undefined
    }
  }

  let lastKey: string | undefined
  let lastSpec: Parameter<any> | undefined

  for (const idx of range(parsedArgs._.length)) {
    const argVal = parsedArgs._[idx]

    let spread = false
    let argKey = argKeys[idx]
    let spec = argSpec[argKey]

    if (argKey) {
      lastKey = argKey
      lastSpec = spec
    } else if (lastKey && lastSpec?.spread) {
      spread = true
      argKey = lastKey
      spec = lastSpec
    } else if (command.allowUndefinedArguments) {
      continue
    } else {
      const expected =
        argKeys.length > 0 ? "only " + naturalList(argKeys.map((key) => styles.accent.bold(key))) : "none"

      throw new ParameterError({
        message: `Unexpected positional argument "${argVal}" (expected ${expected})`,
      })
    }

    try {
      const validated = spec.validate(spec.coerce(argVal))

      if (spread && validated) {
        if (!processedArgs[argKey]) {
          processedArgs[argKey] = []
        }
        processedArgs[argKey].push(...validated)
      } else {
        processedArgs[argKey] = validated
      }
    } catch (error) {
      throw new ParameterError({
        message: `Invalid value for argument ${styles.accent.bold(argKey)}: ${error}`,
      })
    }
  }

  const optSpec = { ...globalOptions, ...(command.options || {}) }
  const optsWithAliases: { [key: string]: Parameter<any> } = {}

  // Apply default values
  const processedOpts = mapValues(optSpec, (spec) => spec.getDefaultValue(cli))

  for (const [name, spec] of Object.entries(optSpec)) {
    optsWithAliases[name] = spec
    for (const alias of spec.aliases || []) {
      optsWithAliases[alias] = spec
    }
  }

  for (const kv of Object.entries(parsedArgs)) {
    const key = kv[0]
    let value = kv[1]

    if (key === "_" || key === "--") {
      continue
    }

    const spec = optsWithAliases[key]
    const flagStr = styles.accent.bold(key.length === 1 ? "-" + key : "--" + key)

    if (!spec) {
      if (command.allowUndefinedArguments && value !== undefined) {
        processedOpts[key as keyof typeof optSpec] = value
      } else {
        errors.push(`Unrecognized option flag ${flagStr}`)
        continue
      }
    }

    if (!optSpec[key]) {
      // Don't double-process the aliases
      continue
    }

    if (!cli && spec.cliOnly) {
      // ignore cliOnly flags if cli=false
      continue
    }

    if (Array.isArray(value) && !spec.type.startsWith("array:")) {
      // Use the last value if the option is used multiple times and the spec is not an array type
      value = value[value.length - 1]
    }

    if (value !== undefined) {
      try {
        value = spec.validate(spec.coerce(value))
        processedOpts[key as keyof typeof optSpec] = value
      } catch (err) {
        if (!(err instanceof GardenError)) {
          throw err
        }
        errors.push(`Invalid value for option ${flagStr}: ${err.message}`)
      }
    }
  }

  if (errors.length > 0) {
    throw new ParameterError({
      message: styles.error.bold(errors.join("\n")),
    })
  }

  // To ensure that `command.params` behaves intuitively in template strings, we don't want to add option keys with
  // null/undefined values.
  //
  // For example, we don't want `${command.params contains 'sync'}` to be `true` when running `garden deploy`
  // unless the `--sync` flag was actually passed (since the user would expect the option value to be an array if
  // present).
  let opts = <ParameterValues<GlobalOptions> & ParameterValues<O>>(
    pickBy(processedOpts, (value) => !(value === undefined || value === null))
  )

  if (!command.isCustom) {
    if (inheritedOpts) {
      opts = { ...inheritedOpts, ...opts }
    }

    if (warnOnGlobalOpts && log) {
      const usedGlobalOptions = Object.entries(parsedArgs)
        // Note: Only some global options are outright ignored in e.g. the dev/serve command now
        .filter(([name, value]) => globalDisplayOptions[name] && !!value)
        .map(([name, _]) => `--${name}`)

      if (usedGlobalOptions.length > 0) {
        log.warn(`Command includes global options that will be ignored: ${usedGlobalOptions.join(", ")}`)
      }
    }
  }

  return {
    args: <BuiltinArgs & ParameterValues<A>>processedArgs,
    opts,
  }
}

/**
 * Parse command line --var input, return as an object.
 * TODO: fix/improve handling of nested variables
 */
export function parseCliVarFlags(cliVars: string[] | undefined) {
  return cliVars ? dotenv.parse(cliVars.join("\n")) : {}
}

export function optionsWithAliasValues<A extends ParameterObject, O extends ParameterObject>(
  command: Command<A, O>,
  parsedOpts: DeepPrimitiveMap
): DeepPrimitiveMap {
  const withAliases = { ...parsedOpts } // Create a new object instead of mutating.
  for (const [name, spec] of Object.entries(command.options || {})) {
    if (parsedOpts[name]) {
      for (const alias of spec.aliases || []) {
        withAliases[alias] = parsedOpts[name]
      }
    }
  }
  return withAliases
}

export function getPopularCommands(commands: Command[]): Command[] {
  const popular = popularCommandFullNames()
  return sortBy(
    commands.filter((cmd) => popular.includes(cmd.getFullName())),
    (cmd) => indexOf(popular, cmd.getFullName())
  )
}

export function getOtherCommands(commands: Command[]): Command[] {
  const popular = popularCommandFullNames()
  return sortBy(
    commands.filter((cmd) => !popular.includes(cmd.getFullName())),
    (cmd) => cmd.getFullName()
  )
}

// These commands are rendered first in the help text, since they're more commonly used than the others.
const popularCommandFullNames = memoize(() => {
  return [
    "build",
    "deploy",
    "test",
    "run",
    "up",
    "logs",
    "sync start",
    "sync status",
    "sync stop",
    "exec",
    "login",
    "logout",
    "quit",
    "reload",
    "hide",
    "log-level",
    "cleanup deploy",
    "cleanup namespace",
    "community",
    "create project",
    "options",
    "publish",
    "self-update",
    "validate",
    "workflow",
  ]
})

export function renderCommands(commands: Command[]) {
  if (commands.length === 0) {
    return "\n"
  }

  const rows = commands.map((command) => {
    return [` ${styles.command(command.getFullName())}`, command.help]
  })

  const maxCommandLength = max(rows.map((r) => r[0]!.length))!

  return renderTable(rows, {
    ...tablePresets["no-borders"],
    colWidths: [null, helpTextMaxWidth() - maxCommandLength - 2],
  })
}

export function renderArguments(params: ParameterObject) {
  return renderParameters(params, (name, param) => {
    return " " + cliStyles.usagePositional(name, param.required, param.spread)
  })
}

export function renderOptions(params: ParameterObject) {
  return renderParameters(params, (name, param) => {
    const renderAlias = (alias: string | undefined): string => {
      if (!alias) {
        return ""
      }
      const prefix = alias.length === 1 ? "-" : "--"
      return `${prefix}${alias}, `
    }
    // Note: If there is more than one alias we don't actually want to print them all in help texts,
    // since generally they're there for backwards compatibility more than normal usage.
    const renderedAlias = renderAlias(param.aliases?.[0])
    return styles.warning(` ${renderedAlias}--${name} `)
  })
}

function renderParameters(params: ParameterObject, formatName: (name: string, param: Parameter<any>) => string) {
  const sortedParams = Object.keys(params).sort()

  const names = sortedParams.map((name) => formatName(name, params[name]))

  const helpTexts = sortedParams.map((name) => {
    const param = params[name]
    const out = param.help
    let hints = ""
    if (param.hints) {
      hints = param.hints
    } else {
      hints = `\n[${param.type}]`
      if (param.defaultValue) {
        hints += ` [default: ${param.defaultValue}]`
      }
    }
    return out + styles.primary(hints)
  })

  const nameColWidth = stringWidth(maxBy(names, (n) => stringWidth(n)) || "") + 2
  const textColWidth = helpTextMaxWidth() - nameColWidth

  return renderTable(zip(names, helpTexts), {
    ...tablePresets["no-borders"],
    colWidths: [nameColWidth, textColWidth],
  })
}

export function renderCommandErrors(logger: Logger, errors: Error[], log?: Log) {
  const gardenErrors: GardenError[] = errors.map(toGardenError)

  const errorLog = log || logger.createLog()

  for (const error of gardenErrors) {
    errorLog.error({
      error,
    })
    // Output error details to console when log level is silly
    errorLog.silly(() => error.toString(true))
  }

  if (logger.getWriters().file.length > 0) {
    errorLog.info(`\nSee .garden/${ERROR_LOG_FILENAME} for detailed error message`)
  }
}


