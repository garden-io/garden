/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as sywac from "sywac"
import { merge, intersection, range } from "lodash"
import { resolve } from "path"
import { safeDump } from "js-yaml"
import { coreCommands } from "../commands/commands"
import stringify = require("json-stringify-safe")

import { DeepPrimitiveMap } from "../config/common"
import {
  getEnumKeys,
  shutdown,
  sleep,
} from "../util/util"
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
import { Garden, ContextOpts } from "../garden"

import { RootLogNode, getLogger } from "../logger/logger"
import { LogLevel, LoggerType } from "../logger/types"
import { BasicTerminalWriter } from "../logger/writers/basic-terminal-writer"
import { FancyTerminalWriter } from "../logger/writers/fancy-terminal-writer"
import { FileWriter } from "../logger/writers/file-writer"
import { Writer } from "../logger/writers/base"

import {
  falsifyConflictingParams,
  failOnInvalidOptions,
  getArgSynopsis,
  getKeys,
  getOptionSynopsis,
  filterByKeys,
  prepareArgConfig,
  prepareOptionConfig,
  styleConfig,
} from "./helpers"
import { GardenConfig } from "../config/base"
import { defaultEnvironments } from "../config/project"

const OUTPUT_RENDERERS = {
  json: (data: DeepPrimitiveMap) => {
    return stringify(data, null, 2)
  },
  yaml: (data: DeepPrimitiveMap) => {
    return safeDump(data, { noRefs: true, skipInvalid: true })
  },
}

const logLevelKeys = getEnumKeys(LogLevel)
// Allow string or numeric log levels
const logLevelChoices = [...logLevelKeys, ...range(logLevelKeys.length).map(String)]

const getLogLevelFromArg = (level: string) => {
  const lvl = parseInt(level, 10)
  if (lvl) {
    return lvl
  }
  return LogLevel[level]
}

// For initializing garden without a project config
export const MOCK_CONFIG: GardenConfig = {
  version: "0",
  dirname: "/",
  path: "/",
  project: {
    name: "mock-project",
    defaultEnvironment: "local",
    environments: defaultEnvironments,
    environmentDefaults: {
      providers: [
        {
          name: "local-kubernetes",
        },
      ],
      variables: {},
    },
  },
}

export const GLOBAL_OPTIONS = {
  root: new StringParameter({
    alias: "r",
    help: "Override project root directory (defaults to working directory).",
    defaultValue: process.cwd(),
  }),
  silent: new BooleanParameter({
    alias: "s",
    help: "Suppress log output.",
    defaultValue: false,
  }),
  env: new EnvironmentOption(),
  loglevel: new ChoicesParameter({
    alias: "l",
    choices: logLevelChoices,
    help:
      "Set logger level. Values can be either string or numeric and are prioritized from 0 to 5 " +
      "(highest to lowest) as follows: error: 0, warn: 1, info: 2, verbose: 3, debug: 4, silly: 5",
    hints:
      "[enum] [default: info] [error || 0, warn || 1, info || 2, verbose || 3, debug || 4, silly || 5]",
    defaultValue: LogLevel[LogLevel.info],
  }),
  output: new ChoicesParameter({
    alias: "o",
    choices: Object.keys(OUTPUT_RENDERERS),
    help: "Output command result in specified format (note: disables progress logging).",
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

    const commands = coreCommands

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
      subCommands,
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
      const parsedArgs = filterByKeys(argv, argKeys)
      const parsedOpts = filterByKeys(argv, optKeys.concat(globalKeys))
      const root = resolve(process.cwd(), parsedOpts.root)
      const { env, loglevel, silent, output } = parsedOpts

      // Init logger
      const level = getLogLevelFromArg(loglevel)
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
            path: ".",
            filename: ERROR_LOG_FILENAME,
            level: LogLevel.error,
            truncatePrevious: true,
          }),
        )
      }

      const logger = RootLogNode.initialize({ level, writers })
      let garden: Garden
      let result
      do {
        const contextOpts: ContextOpts = { env, logger }
        if (command.noProject) {
          contextOpts.config = MOCK_CONFIG
        }
        garden = await Garden.factory(root, contextOpts)
        // TODO: enforce that commands always output DeepPrimitiveMap
        result = await command.action({
          ctx: garden.getPluginContext(),
          args: parsedArgs,
          opts: parsedOpts,
          garden,
        })
      } while (result.restartRequired)

      // We attach the action result to cli context so that we can process it in the parse method
      cliContext.details.result = result
    }

    // Command specific positional args and options are set inside the builder function
    const setup = parser => {
      subCommands.forEach(subCommandCls => this.addCommand(new subCommandCls(command), parser))
      argKeys.forEach(key => parser.positional(getArgSynopsis(key, args[key]), prepareArgConfig(args[key])))
      optKeys.forEach(key => parser.option(getOptionSynopsis(key, options[key]), prepareOptionConfig(options[key])))

      // We only check for invalid flags for the last command since it might contain flags that
      // the parent is unaware of, thus causing the check to fail for the parent
      if (subCommands.length < 1) {
        parser.check(failOnInvalidOptions)
      }
      return parser
    }

    const commandConfig = {
      setup,
      aliases: command.alias,
      desc: command.help,
      run: action,
    }

    program.command(command.name, commandConfig)
  }

  async parse(): Promise<ParseResults> {
    const parseResult: SywacParseResults = await this.program.parse()
    const { argv, details, errors, output: cliOutput } = parseResult
    const { result: commandResult } = details
    const { output } = argv
    let { code } = parseResult
    let logger

    // Note: Circumvents an issue where the process exits before the output is fully flushed.
    // Needed for output renderers and Winston (see: https://github.com/winstonjs/winston/issues/228)
    const waitForOutputFlush = () => sleep(100)

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

      // fix issue where sywac returns exit code 0 even when a command doesn't exist
      if (!argv.h && !argv.help) {
        code = 1
      }

      process.exit(code)
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
      await waitForOutputFlush()
    }

    if (gardenErrors.length > 0) {
      gardenErrors.forEach(error => logger.error({
        msg: error.message,
        error,
      }))

      if (logger.writers.find(w => w instanceof FileWriter)) {
        logger.info(`\nSee ${ERROR_LOG_FILENAME} for detailed error message`)
        await waitForOutputFlush()
      }

      code = 1
    }

    logger.stop()
    return { argv, code, errors }
  }

}

export async function run(): Promise<void> {
  let code
  try {
    const cli = new GardenCli()
    const result = await cli.parse()
    code = result.code
  } catch (err) {
    console.log(err)
    code = 1
  } finally {
    shutdown(code)
  }
}
