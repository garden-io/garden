/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as sywac from "sywac"
import chalk from "chalk"
import { shutdown } from "./util"
import { merge, intersection, reduce } from "lodash"
import {
  BooleanParameter,
  Command,
  ChoicesParameter,
  ParameterValues,
  Parameter,
  StringParameter,
} from "./commands/base"
import { ValidateCommand } from "./commands/validate"
import { InternalError, PluginError } from "./exceptions"
import { GardenContext } from "./context"
import { FileWriter } from "./logger/writers"
import { getLogger, RootLogNode } from "./logger"
import { resolve } from "path"
import { BuildCommand } from "./commands/build"
import { EnvironmentCommand } from "./commands/environment/index"
import { DeployCommand } from "./commands/deploy"
import { CallCommand } from "./commands/call"
import { defaultPlugins } from "./plugins"
import { TestCommand } from "./commands/test"
import { DevCommand } from "./commands/dev"
import { LogsCommand } from "./commands/logs"
import { LogLevel } from "./logger/types"
import { ConfigCommand } from "./commands/config"

const GLOBAL_OPTIONS = {
  root: new StringParameter({
    alias: "r",
    help: "override project root directory (defaults to working directory)",
    defaultValue: process.cwd(),
  }),
  verbose: new BooleanParameter({
    alias: "v",
    help: "verbose logging",
    overrides: ["silent"],
  }),
  silent: new BooleanParameter({
    alias: "s",
    help: "silence logger",
  }),
}
const GLOBAL_OPTIONS_GROUP_NAME = "Global options"
const STYLE_CONFIG = {
  usagePrefix: str => (
    `
${chalk.bold(str.slice(0, 5).toUpperCase())}

  ${chalk.italic(str.slice(7))}`
  ),
  usageCommandPlaceholder: str => chalk.blue(str),
  usagePositionals: str => chalk.magenta(str),
  usageArgsPlaceholder: str => chalk.magenta(str),
  usageOptionsPlaceholder: str => chalk.yellow(str),
  group: (str: string) => {
    const cleaned = str.endsWith(":") ? str.slice(0, -1) : str
    return chalk.bold(cleaned.toUpperCase()) + "\n"
  },
  flags: (str, _type) => {
    const style = str.startsWith("-") ? chalk.green : chalk.magenta
    return style(str)
  },
  hints: str => chalk.gray(str),
  groupError: str => chalk.red.bold(str),
  flagsError: str => chalk.red.bold(str),
  descError: str => chalk.yellow.bold(str),
  hintsError: str => chalk.red(str),
  messages: str => chalk.red.bold(str), // these are error messages
}
const ERROR_LOG_FILENAME = "error.log"

// Helper functions
const getKeys = (obj): string[] => Object.keys(obj || {})
const filterByArray = (obj: any, arr: string[]): any => {
  return arr.reduce((memo, key) => {
    if (obj[key]) {
      memo[key] = obj[key]
    }
    return memo
  }, {})
}

// Parameter types T which map between the Parameter<T> class and the Sywac cli library
// In case we add types that aren't supported natively by Sywac, see: http://sywac.io/docs/sync-config.html#custom
const VALID_PARAMETER_TYPES = ["boolean", "number", "choice", "string"]

type FalsifiedParams = { [key: string]: false }

interface OptConfig {
  desc: string | string[]
  type: string
  defaultValue?: any
  choices?: any[]
  required?: boolean
  strict: true
}

export interface ParseResults {
  argv: any
  code: number
  errors: Error[]
}

interface SywacParseResults extends ParseResults {
  output: string
  details: any
}

function makeOptSynopsis(key: string, param: Parameter<any>): string {
  return param.alias ? `-${param.alias}, --${key}` : `--${key}`
}

function makeArgSynopsis(key: string, param: Parameter<any>) {
  return param.required ? `<${key}>` : `[${key}]`
}

function makeArgConfig(param: Parameter<any>) {
  return {
    desc: param.help,
    params: [makeOptConfig(param)],
  }
}

function makeOptConfig(param: Parameter<any>): OptConfig {
  const {
    defaultValue,
    help: desc,
    required,
    type,
  } = param
  if (!VALID_PARAMETER_TYPES.includes(type)) {
    throw new InternalError(`Invalid parameter type for cli: ${type}`, {
      type,
      validParameterTypes: VALID_PARAMETER_TYPES,
    })
  }
  let config: OptConfig = {
    defaultValue,
    desc,
    required,
    type,
    strict: true,
  }
  if (type === "choice") {
    config.type = "enum"
    config.choices = (<ChoicesParameter>param).choices
  }
  return config
}

/**
 * Returns the params that need to be overridden set to false
 */
function falsifyConflictingParams(argv, params: ParameterValues<any>): FalsifiedParams {
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

export class GardenCli {
  program: any
  commands: { [key: string]: Command } = {}
  logger: RootLogNode

  constructor() {
    const version = require("../package.json").version

    this.logger = getLogger()
    this.program = sywac
      .help("-h, --help", {
        group: GLOBAL_OPTIONS_GROUP_NAME,
        implicitCommand: false,
      })
      .version("-v, --version", {
        version,
        group: GLOBAL_OPTIONS_GROUP_NAME,
        implicitCommand: false,
      })
      .showHelpByDefault()
      .check((argv, _context) => {
        // NOTE: Need to mutate argv!
        merge(argv, falsifyConflictingParams(argv, GLOBAL_OPTIONS))
      })
      .style(STYLE_CONFIG)

    const commands = [
      new BuildCommand(),
      new CallCommand(),
      new DeployCommand(),
      new DevCommand(),
      new EnvironmentCommand(),
      new LogsCommand(),
      new TestCommand(),
      new ConfigCommand(),
      new ValidateCommand(),
    ]
    const globalOptions = Object.entries(GLOBAL_OPTIONS)

    commands.forEach(command => this.addCommand(command, this.program))
    globalOptions.forEach(([key, opt]) => this.addGlobalOption(key, opt))
  }

  addGlobalOption(key: string, option: Parameter<any>): void {
    this.program.option(makeOptSynopsis(key, option), {
      ...makeOptConfig(option),
      group: GLOBAL_OPTIONS_GROUP_NAME,
    })
  }

  addCommand(command: Command, program): void {
    if (this.commands[command.name]) {
      // For now we don't allow multiple definitions of the same command. We may want to revisit this later.
      throw new PluginError(`Multiple definitions of command "${command.name}"`, {})
    }

    this.commands[command.name] = command

    const args = command.arguments as Parameter<any>
    const options = command.options as Parameter<any>
    const subCommands = command.subCommands || []
    const argKeys = getKeys(args)
    const optKeys = getKeys(options)
    const globalKeys = getKeys(GLOBAL_OPTIONS)
    const dupKeys: string[] = intersection(optKeys, globalKeys)

    if (dupKeys.length > 0) {
      throw new PluginError(`Global option(s) ${dupKeys.join(" ")} cannot be redefined`, {})
    }

    const action = async argv => {
      const logger = this.logger
      // Sywac returns positional args and options in a single object which we separate into args and opts
      const argsForAction = filterByArray(argv, argKeys)
      const optsForAction = filterByArray(argv, optKeys.concat(globalKeys))
      const root = resolve(process.cwd(), optsForAction.root)

      // Update logger config
      if (argv.silent) {
        logger.level = LogLevel.silent
        logger.writers = []
      } else {
        const level = argv.verbose ? LogLevel.verbose : logger.level
        logger.level = level
        logger.writers.push(
          new FileWriter({ level, root }),
          new FileWriter({ level: LogLevel.error, filename: ERROR_LOG_FILENAME, root }),
        )
      }

      const ctx = await GardenContext.factory(root, { logger, plugins: defaultPlugins })
      return command.action(ctx, argsForAction, optsForAction)
    }

    // Command specific positional args and options are set inside the builder function
    const setup = parser => {
      subCommands.forEach(subCommand => this.addCommand(subCommand, parser))
      argKeys.forEach(key => parser.positional(makeArgSynopsis(key, args[key]), makeArgConfig(args[key])))
      optKeys.forEach(key => parser.option(makeOptSynopsis(key, options[key]), makeOptConfig(options[key])))
    }

    const commandOpts = {
      setup,
      aliases: command.alias,
      desc: command.help,
      run: action,
    }

    program.command(command.name, commandOpts)
  }

  async parse(): Promise<ParseResults> {
    return this.program.parse().then((result: SywacParseResults) => {
      const { argv, errors, code, output } = result

      // --help or --version options were called
      if (output && !(errors.length > 0)) {
        this.logger.stop()
        console.log(output)
        process.exit(result.code)
      }

      if (errors.length > 0) {
        errors.forEach(err => this.logger.error({ msg: err.message, error: err }))
        this.logger.info({
          msg: `See ${ERROR_LOG_FILENAME} for detailed error message`,
        },
        )
      }

      this.logger.stop()
      return { argv, code, errors }
    })
  }

}

export async function run(): Promise<void> {
  const cli = new GardenCli()
  return cli.parse().then(result => shutdown(result.code))
}
