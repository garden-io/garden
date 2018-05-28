/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as sywac from "sywac"
import { difference, merge, intersection } from "lodash"
import { resolve } from "path"
import { safeDump } from "js-yaml"
import stringify = require("json-stringify-safe")

import { DeepPrimitiveMap } from "../types/common"
import {
  enumToArray,
  shutdown,
  sleep,
} from "../util"
import {
  BooleanParameter,
  Command,
  ChoicesParameter,
  Parameter,
  StringParameter,
  EnvironmentOption,
  CommandResult,
} from "../commands/base"
import {
  GardenError,
  PluginError,
  toGardenError,
} from "../exceptions"
import { Garden } from "../garden"

import { BuildCommand } from "../commands/build"
import { CallCommand } from "../commands/call"
import { ConfigCommand } from "../commands/config"
import { DeployCommand } from "../commands/deploy"
import { DevCommand } from "../commands/dev"
import { EnvironmentCommand } from "../commands/environment/index"
import { PushCommand } from "../commands/push"
import { LoginCommand } from "../commands/login"
import { LogoutCommand } from "../commands/logout"
import { LogsCommand } from "../commands/logs"
import { RunCommand } from "../commands/run"
import { ScanCommand } from "../commands/scan"
import { StatusCommand } from "../commands/status"
import { TestCommand } from "../commands/test"
import { ValidateCommand } from "../commands/validate"

import { RootLogNode, getLogger } from "../logger"
import { LogLevel, LoggerType } from "../logger/types"
import { BasicTerminalWriter } from "../logger/writers/basic-terminal-writer"
import { FancyTerminalWriter } from "../logger/writers/fancy-terminal-writer"
import { FileWriter } from "../logger/writers/file-writer"
import { Writer } from "../logger/writers/base"

import {
  falsifyConflictingParams,
  getAliases,
  getArgSynopsis,
  getKeys,
  getOptionSynopsis,
  filterByArray,
  prepareArgConfig,
  prepareOptionConfig,
  styleConfig,
} from "./helpers"

const OUTPUT_RENDERERS = {
  json: (data: DeepPrimitiveMap) => {
    return stringify(data, null, 2)
  },
  yaml: (data: DeepPrimitiveMap) => {
    return safeDump(data, { noRefs: true, skipInvalid: true })
  },
}

const GLOBAL_OPTIONS = {
  root: new StringParameter({
    alias: "r",
    help: "override project root directory (defaults to working directory)",
    defaultValue: process.cwd(),
  }),
  silent: new BooleanParameter({
    alias: "s",
    help: "suppress log output",
    defaultValue: false,
  }),
  env: new EnvironmentOption(),
  loglevel: new ChoicesParameter({
    alias: "log",
    choices: enumToArray(LogLevel),
    help: "set logger level",
    defaultValue: LogLevel[LogLevel.info],
  }),
  output: new ChoicesParameter({
    alias: "o",
    choices: Object.keys(OUTPUT_RENDERERS),
    help: "output command result in specified format (note: disables progress logging)",
  }),
}
const GLOBAL_OPTIONS_GROUP_NAME = "Global options"
const ERROR_LOG_FILENAME = "error.log"
const DEFAULT_CLI_LOGGER_TYPE = LoggerType.fancy

export interface ParseResults {
  argv: any
  code: number
  errors: (GardenError | Error)[]
}

interface SywacParseResults extends ParseResults {
  output: string
  details: { logger: RootLogNode, result?: CommandResult }
}

export class GardenCli {
  program: any
  commands: { [key: string]: Command } = {}

  constructor() {
    const version = require("../../package.json").version
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
      .check((argv, _ctx) => {
        // NOTE: Need to mutate argv!
        merge(argv, falsifyConflictingParams(argv, GLOBAL_OPTIONS))
      })
      .style(styleConfig)

    const commands = [
      new BuildCommand(),
      new CallCommand(),
      new ConfigCommand(),
      new DeployCommand(),
      new DevCommand(),
      new EnvironmentCommand(),
      new LoginCommand(),
      new LogoutCommand(),
      new LogsCommand(),
      new PushCommand(),
      new RunCommand(),
      new ScanCommand(),
      new StatusCommand(),
      new TestCommand(),
      new ValidateCommand(),
    ]

    const globalOptions = Object.entries(GLOBAL_OPTIONS)

    commands.forEach(command => this.addCommand(command, this.program))
    globalOptions.forEach(([key, opt]) => this.addGlobalOption(key, opt))
  }

  addGlobalOption(key: string, option: Parameter<any>): void {
    this.program.option(getOptionSynopsis(key, option), {
      ...prepareOptionConfig(option),
      group: GLOBAL_OPTIONS_GROUP_NAME,
    })
  }

  addCommand(command: Command, program): void {
    const fullName = command.getFullName()

    if (this.commands[fullName]) {
      // For now we don't allow multiple definitions of the same command. We may want to revisit this later.
      throw new PluginError(`Multiple definitions of command "${fullName}"`, {})
    }

    this.commands[fullName] = command

    const {
      arguments: args = {},
      loggerType = DEFAULT_CLI_LOGGER_TYPE,
      options = {},
      subCommands = [],
    } = command

    const argKeys = getKeys(args)
    const optKeys = getKeys(options)
    const globalKeys = getKeys(GLOBAL_OPTIONS)
    const dupKeys: string[] = intersection(optKeys, globalKeys)

    if (dupKeys.length > 0) {
      throw new PluginError(`Global option(s) ${dupKeys.join(" ")} cannot be redefined`, {})
    }

    const action = async (argv, cliContext) => {
      // Sywac returns positional args and options in a single object which we separate into args and opts
      const parsedArgs = filterByArray(argv, argKeys)
      const parsedOpts = filterByArray(argv, optKeys.concat(globalKeys))
      const root = resolve(process.cwd(), parsedOpts.root)
      const { env, loglevel, silent, output } = parsedOpts

      // Validate options (feels like the parser should handle this)
      const builtinOptions = ["help", "h", "version", "v"]
      const availableOptions = [...getAliases(options), ...getAliases(GLOBAL_OPTIONS), ...builtinOptions]
      const passedOptions = cliContext.args
        .filter(str => str.startsWith("-") || str.startsWith("--"))
        .map(str => str.startsWith("--") ? str.slice(2) : str.slice(1))
        .map(str => str.split("=")[0])
      const invalid = difference(passedOptions, availableOptions)
      if (invalid.length > 0) {
        cliContext.cliMessage(`Received invalid flag(s): ${invalid.join(" ")}`)
        return
      }

      // Init logger
      const level = LogLevel[<string>loglevel]
      let writers: Writer[] = []

      if (!silent && !output && loggerType !== LoggerType.quiet) {
        if (loggerType === LoggerType.fancy) {
          writers.push(new FancyTerminalWriter())
        } else if (loggerType === LoggerType.basic) {
          writers.push(new BasicTerminalWriter())
        }

        writers.push(
          await FileWriter.factory({
            root,
            level,
            filename: "development.log",
          }),
          await FileWriter.factory({
            root,
            filename: ERROR_LOG_FILENAME,
            level: LogLevel.error,
          }),
          await FileWriter.factory({
            root,
            logDirPath: ".",
            filename: ERROR_LOG_FILENAME,
            level: LogLevel.error,
            truncatePrevious: true,
          }),
        )
      }

      const logger = RootLogNode.initialize({ level, writers })
      const garden = await Garden.factory(root, { env, logger })

      // TODO: enforce that commands always output DeepPrimitiveMap
      const result = await command.action(garden.pluginContext, parsedArgs, parsedOpts)

      // We attach the action result to cli context so that we can process it in the parse method
      cliContext.details.result = result
    }

    // Command specific positional args and options are set inside the builder function
    const setup = parser => {
      subCommands.forEach(subCommandCls => this.addCommand(new subCommandCls(command), parser))
      argKeys.forEach(key => parser.positional(getArgSynopsis(key, args[key]), prepareArgConfig(args[key])))
      optKeys.forEach(key => parser.option(getOptionSynopsis(key, options[key]), prepareOptionConfig(options[key])))
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
    const parseResult: SywacParseResults = await this.program.parse()
    const { argv, details, errors, output: cliOutput } = parseResult
    const { result: commandResult } = details
    const { output } = argv
    let { code } = parseResult
    let logger

    // Logger might not have been initialised if process exits early
    try {
      logger = getLogger()
    } catch (_) {
      logger = RootLogNode.initialize({
        level: LogLevel.info,
        writers: [new BasicTerminalWriter()],
      })
    }

    // --help or --version options were called so we log the cli output and exit
    if (cliOutput && errors.length < 1) {
      logger.stop()
      console.log(cliOutput)
      process.exit(parseResult.code)
    }

    const gardenErrors: GardenError[] = errors
      .map(toGardenError)
      .concat((commandResult && commandResult.errors) || [])

    // --output option set
    if (output) {
      const renderer = OUTPUT_RENDERERS[output]
      if (gardenErrors.length > 0) {
        console.error(renderer({ success: false, errors: gardenErrors }))
      } else {
        console.log(renderer({ success: true, ...commandResult }))
      }
      // Note: this circumvents an issue where the process exits before the output is fully flushed
      await sleep(100)
    }

    if (gardenErrors.length > 0) {
      gardenErrors.forEach(error => logger.error({
        msg: error.message,
        error,
      }))

      if (logger.writers.find(w => w instanceof FileWriter)) {
        logger.info(`\nSee ${ERROR_LOG_FILENAME} for detailed error message`)
      }

      code = 1
    }

    logger.stop()
    return { argv, code, errors }
  }

}

export async function run(): Promise<void> {
  const cli = new GardenCli()
  return cli.parse().then(result => shutdown(result.code))
}
